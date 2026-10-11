/**
 * The MXW01 graphic-mode thermal printer driver — a port of the reverse-
 * engineered reference (github.com/eliorpom-cmd/print-on-my-desk), which was
 * worked out byte by byte with packet captures and paper.
 *
 * This printer does NOT speak ESC/POS. It takes a raster over ae03, and the
 * only proof a ticket arrived whole is the CRC8 it echoes back in its AA
 * notification. Nothing here is invented: every quirk below is a measurement
 * documented in that repo's 09-protocol.md, and the comments that contradict
 * other implementations are the accurate ones.
 */

import { WIDTH_BYTES, crc8 } from './canvas'

// --- GATT -------------------------------------------------------------------

// The printer ADVERTISES af30 and EXPOSES ae30. They are not the same number,
// and a scan filtering on ae30 finds nothing at all — the single most common
// way an MXW01 project fails to see a printer that is sitting right there.
export const ADV_SERVICE = 0xaf30
export const GATT_SERVICE = 0x0000ae30
export const CHAR_CONTROL = 0x0000ae01 // write without response
export const CHAR_NOTIFY = 0x0000ae02 // notify
export const CHAR_DATA = 0x0000ae03 // write without response

export const uuid = (n: number) =>
  `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`

// --- commands ---------------------------------------------------------------

const CMD_STATUS = 0xa1
const CMD_INTENSITY = 0xa2
const CMD_FEED = 0xa3
const CMD_PRINT = 0xa9
const CMD_PRINT_DONE = 0xaa
const CMD_FLUSH = 0xad

// Mode 0x00 makes the printer eject ~3 cm on its own. Mode 0x01 prints
// identically and ejects almost none, so the tear feed is ours to command.
const MODE_SHORT_FEED = 0x01

// Never exceed this; above it the head cooks.
const MAX_INTENSITY = 0xc0

// The head keeps climbing after a print ends, so starting needs headroom:
// 45 C is the ceiling, 38 C is where we refuse to start.
const MAX_HEAD_C = 45
const START_BELOW_C = 38

// Never fire two tickets truly back to back.
const MIN_PRINT_GAP_MS = 20_000

// The printer falls asleep ~ten minutes after the last GATT connection and
// only its button wakes it, so a transport that stays connected pings it
// every five minutes for as long as the tab is open.
export const KEEPALIVE_MS = 5 * 60 * 1000

// The data-write pacing. The floor is set by the HOST's BLE stack (4 ms
// measured on a Pico), not by the printer. We start more conservatively and
// climb permanently on a stall. A stalled line is retried — counted once, so
// the checksum stays right — and the transfer slows down for good.
const PACE_MS = 10
const PACE_BACKOFF_MS = 3
const PACE_MAX_MS = 45
const WRITE_RETRIES = 8

const NOTIFY_TIMEOUT_MS = 4000
const PRINT_BASE_TIMEOUT_MS = 8000
const PRINT_MS_PER_LINE = 70

// --- notifications ----------------------------------------------------------

/**
 * `22 21 | cmd | 00 | len_le(2) | payload | crc8(payload) | FF`
 */
export function frame(cmd: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length)
  out[0] = 0x22
  out[1] = 0x21
  out[2] = cmd
  out[3] = 0x00
  out[4] = payload.length & 0xff
  out[5] = (payload.length >> 8) & 0xff
  out.set(payload, 6)
  out[6 + payload.length] = crc8(payload)
  out[7 + payload.length] = 0xff
  return out
}

/**
 * Reads a notification. The layout is 6 + n + 1, NOT the 8 + n most
 * implementations expect — they wait for a trailing byte that does not exist.
 * One tail byte, always 0x00, and it is not a checksum.
 */
export function parseNotification(data: Uint8Array): { cmd: number; payload: Uint8Array } | null {
  if (data.length < 7 || data[0] !== 0x22 || data[1] !== 0x21) return null
  const n = data[4] | (data[5] << 8)
  if (data.length < 6 + n) return null
  return { cmd: data[2], payload: data.slice(6, 6 + n) }
}

// --- errors -----------------------------------------------------------------

export class PrinterError extends Error {}

/** The roll is empty — the failure that eats a job silently: with no paper
 *  the printer still accepts the whole buffer and returns the right checksum. */
export class NoPaper extends PrinterError {}

/** The head is too hot to start. Wait; do not print. */
export class TooHot extends PrinterError {}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// --- link -----------------------------------------------------------

/**
 * The only thing the driver needs from the outside: two write-without-response
 * characteristics (control ae01, image data ae03) and the aa02 notification
 * stream, already subscribed. The transport owns the GATT session/rewire logic.
 */
export interface Mxw01Link {
  writeControl(bytes: Uint8Array): Promise<void>
  writeData(bytes: Uint8Array): Promise<void>
  onNotification(cb: (bytes: Uint8Array) => void): void
  isConnected(): boolean
}

export interface Mxw01PrintResult {
  ok: boolean
  expected: number
  reported: number | null
  sent: number
}

export interface Mxw01Status {
  state: number
  supply: number
  temperature: number
  errorFlag: number
  paperOk: boolean
  raw: Uint8Array
}

export class Mxw01PrintSession {
  readonly link: Mxw01Link
  private waiters = new Map<number, (payload: Uint8Array) => void>()
  lastPrintAt = 0
  lastSentLines = 0
  private lastStalls = 0
  private lastPaceMs = PACE_MS

  constructor(link: Mxw01Link) {
    this.link = link
    link.onNotification((bytes) => {
      const parsed = parseNotification(bytes)
      if (!parsed) return
      const waiter = this.waiters.get(parsed.cmd)
      if (waiter) {
        this.waiters.delete(parsed.cmd)
        waiter(parsed.payload)
      }
    })
  }

  async send(cmd: number, payload: Uint8Array): Promise<void> {
    if (!this.link.isConnected()) throw new PrinterError('not connected')
    await this.link.writeControl(frame(cmd, payload))
  }

  waitFor(cmd: number, timeoutMs = NOTIFY_TIMEOUT_MS): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(cmd)
        resolve(null)
      }, timeoutMs)
      this.waiters.set(cmd, (payload) => {
        clearTimeout(timer)
        resolve(payload)
      })
    })
  }

  /**
   * The A1 status frame. `p` is the PAYLOAD (frame minus its 6 header bytes),
   * and the offsets below are payload offsets — the reference recalculated
   * upstream's frame offsets and both agree here.
   *
   * No-paper has TWO signals because units disagree, and getting this wrong is
   * the one silent failure: with the roll out, the printer still eats the whole
   * buffer and returns a correct checksum. So:
   *   - the paper byte p[9] == 0x07 (roll out; error flag stays 0x00) — the
   *     reference's measurement, verified over 34 healthy + 5 empty frames; or
   *   - the error flag set with error code 1 or 9 (the catprinter spec).
   * Every OTHER value at p[9] means "loaded": several units put the BATTERY
   * reading there, and treating that as empty fails every single job.
   */
  async status(): Promise<Mxw01Status | null> {
    await this.send(CMD_STATUS, Uint8Array.of(0x00))
    const p = await this.waitFor(CMD_STATUS)
    if (!p || p.length < 9) return null
    const errorFlag = p[6]
    const errorCode = p.length > 7 ? p[7] : 0
    const noPaper =
      p.length > 9 && (p[9] === 0x07 || (errorFlag !== 0 && (errorCode === 1 || errorCode === 9)))
    return {
      state: p[0], // 0 idle, 1 printing, 3 ejecting
      supply: p[3], // charge at rest, sags under load — a supply reading
      temperature: p[4], // °C
      errorFlag,
      paperOk: !noPaper,
      raw: p,
    }
  }

  /** Feeds blank lines so the last printed line clears the tear bar. */
  async feed(lines: number): Promise<Uint8Array | null> {
    await this.send(CMD_FEED, Uint8Array.of(lines & 0xff, (lines >> 8) & 0xff))
    return await this.waitFor(CMD_FEED)
  }

  /** A keepalive: one status read resets the printer's sleep timer. */
  async keepalive(): Promise<Mxw01Status | null> {
    if (!this.link.isConnected()) return null
    return await this.status()
  }

  /**
   * Prints one bitmap and verifies the printer echoed the exact image checksum.
   * `resume` lets the transport silently re-open a dropped GATT connection.
   */
  async print(
    lines: Uint8Array,
    options: { intensity?: number; feedLines?: number; maxTempC?: number } = {},
    resume?: () => Promise<void>,
  ): Promise<Mxw01PrintResult> {
    const intensity = options.intensity ?? 0x5d
    const feedLines = options.feedLines ?? 7
    const maxTempC = options.maxTempC ?? START_BELOW_C

    if (!this.link.isConnected()) {
      if (!resume) throw new PrinterError('not connected')
      await resume()
    }
    if (intensity > MAX_INTENSITY) {
      throw new PrinterError(`intensity 0x${intensity.toString(16)} is over the cap`)
    }
    if (lines.length % WIDTH_BYTES !== 0) {
      throw new PrinterError(`${lines.length} bytes is not a whole number of lines`)
    }
    const lineCount = lines.length / WIDTH_BYTES

    // Reset before anything can fail: every check happens before a single byte
    // goes out, so a refused job never touched paper and can be requeued
    // without any risk of printing twice.
    this.lastSentLines = 0

    await this.send(CMD_INTENSITY, Uint8Array.of(intensity))
    await sleep(100)

    const since = Date.now() - this.lastPrintAt
    if (this.lastPrintAt && since < MIN_PRINT_GAP_MS) await sleep(MIN_PRINT_GAP_MS - since)

    const status = await this.status()
    if (!status) throw new PrinterError('the printer did not answer a status request')

    // Paper BEFORE the error flag, and the order is the point: an empty roll
    // also raises the flag, so checking the flag first means the paper byte is
    // never read — and this is the failure that would silently destroy a job.
    if (!status.paperOk) {
      const hex = [...status.raw].map((b) => b.toString(16).padStart(2, '0')).join('')
      throw new NoPaper(`the roll is empty (status ${hex})`)
    }
    if (status.errorFlag !== 0) {
      const hex = [...status.raw].map((b) => b.toString(16).padStart(2, '0')).join('')
      throw new PrinterError(`printer error flag 0x${status.errorFlag.toString(16)} (${hex})`)
    }
    const ceiling = Math.min(maxTempC, MAX_HEAD_C)
    if (status.temperature > ceiling) {
      throw new TooHot(`head at ${status.temperature} C, will not start above ${ceiling}`)
    }

    await this.send(
      CMD_PRINT,
      Uint8Array.of(lineCount & 0xff, (lineCount >> 8) & 0xff, 0x30, MODE_SHORT_FEED),
    )
    const accepted = await this.waitFor(CMD_PRINT)
    if (!accepted) throw new PrinterError('no answer to the print request')
    if (accepted[0] !== 0x00) throw new PrinterError(`print request refused: ${accepted[0]}`)

    let expected = 0
    let sent = 0
    let stalls = 0
    let pace = PACE_MS

    for (let i = 0; i < lineCount; i++) {
      const line = lines.subarray(i * WIDTH_BYTES, (i + 1) * WIDTH_BYTES)
      for (let attempt = 0; ; attempt++) {
        try {
          await this.link.writeData(line)
          break
        } catch {
          // The browser's GATT queue is full or the previous write is still in
          // flight — not a corrupted ticket. Retried, counted once, and the
          // transfer slows down permanently: a stall is evidence the pacing is
          // too tight for this transfer's conditions.
          if (attempt >= WRITE_RETRIES - 1) throw new PrinterError('the data channel stalled')
          stalls++
          if (pace < PACE_MAX_MS) pace = Math.min(pace + PACE_BACKOFF_MS, PACE_MAX_MS)
          await sleep(pace * (attempt + 2))
        }
      }
      expected = crc8(line, expected)
      sent++
      this.lastSentLines = sent
      await sleep(pace)
    }

    this.lastStalls = stalls
    this.lastPaceMs = pace

    await this.send(CMD_FLUSH, Uint8Array.of(0x00))

    const done = await this.waitFor(
      CMD_PRINT_DONE,
      PRINT_BASE_TIMEOUT_MS + lineCount * PRINT_MS_PER_LINE,
    )
    this.lastPrintAt = Date.now()
    if (!done) return { ok: false, expected, reported: null, sent }

    // AA payload is `00 <crc8> <crc8>`. Comparing it to what we computed on
    // the way out is the ONLY proof a ticket came out whole. Never drop it.
    const reported = done.length > 1 ? done[1] : null
    if (feedLines > 0) await this.feed(feedLines)
    return { ok: reported === expected, expected, reported, sent }
  }

  get stalls(): number {
    return this.lastStalls
  }

  get paceMs(): number {
    return this.lastPaceMs
  }
}