/* Verification that the MXW01 raster path is real:
   - CRC8 matches the documented Dallas/Maxim algorithm
   - the canvas packs pixels the way the printer was captured receiving them
   - frames and notifications parse byte-for-byte
   - the driver completes a full session against a fake printer, checksum and all
   - the receipt composer produces 48-byte-per-line images

   Run: node scripts/print-raster-test.mjs */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const out = mkdtempSync(join(tmpdir(), 'cpos-raster-'))

const files = [
  'src/lib/print/raster/canvas.ts',
  'src/lib/print/raster/font.ts',
  'src/lib/print/raster/font-atlas.ts',
  'src/lib/print/raster/mxw01.ts',
  'src/lib/print/raster/receipt-raster.ts',
  'src/lib/format.ts',
  'src/lib/mock-clock.ts',
  'src/lib/types.ts',
]

const program = ts.createProgram(files, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  outDir: out,
})
program.emit()

// tsc (bundler resolution) emits extensionless relative imports — patch them.
function patch(relPath, replacements) {
  const full = join(out, relPath)
  let src = readFileSync(full, 'utf8')
  for (const [from, to] of replacements) src = src.split(from).join(to)
  writeFileSync(full, src)
}
patch('print/raster/font.js', [["from './font-atlas'", "from './font-atlas.js'"]])
patch('print/raster/mxw01.js', [["from './canvas'", "from './canvas.js'"]])
patch('print/raster/receipt-raster.js', [
  ["from './canvas'", "from './canvas.js'"],
  ["from './font'", "from './font.js'"],
  ["from '../../format'", "from '../../format.js'"],
  ["from '../../types'", "from '../../types.js'"],
])
patch('format.js', [["from './mock-clock'", "from './mock-clock.js'"]])

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const mod = (p) => import(pathToFileURL(join(out, p)).href)
const { Canvas, crc8, WIDTH_BYTES, WIDTH_PIXELS } = await mod('print/raster/canvas.js')
const { frame, parseNotification, Mxw01PrintSession, NoPaper, TooHot, PrinterError } = await mod(
  'print/raster/mxw01.js',
)
const { buildRasterTest, buildRasterReceipt, rasterize } = await mod('print/raster/receipt-raster.js')
const { DEFAULT_RECEIPT_LAYOUT } = await mod('types.js')

let failures = 0
function check(name, cond) {
  if (cond) console.log(`PASS ${name}`)
  else {
    console.log(`FAIL ${name}`)
    failures++
  }
}

// --- independent CRC8 (bitwise, Dallas/Maxim poly 0x07, init 0x00) ----------
function crc8ref(bytes, crc = 0) {
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff
  }
  return crc
}

const ascii = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)))
const hex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ')

// --- 1. CRC8 ---------------------------------------------------------------
check('crc8("123456789") === 0xF4 (CRC-8 check value)', crc8(ascii('123456789')) === 0xf4)
check('crc8 matches the independent bitwise implementation', crc8(ascii('Dela Cruz BBQ')) === crc8ref(ascii('Dela Cruz BBQ')))
check('crc8 accumulates (incremental == one-shot)', crc8(ascii('xyz'), crc8(ascii('abc'))) === crc8(ascii('abcxyz')))

// --- 2. canvas packing -----------------------------------------------------
const c = new Canvas()
check('canvas is 48 bytes/line at 384 px', c.widthBytes === WIDTH_BYTES && WIDTH_PIXELS === 384)
c.setPixel(0, 0)
c.setPixel(7, 0)
c.setPixel(8, 0)
check('bit 0 of a byte is the LEFTMOST pixel', c.rows[0][0] === 0b10000001)
check('pixel 8 lands in the next byte', c.rows[0][1] === 0b00000001)
c.setPixel(383, 0)
check('pixel 383 sets the high bit of the last byte', c.rows[0][47] === 0b10000000)
check('setPixel out of bounds is ignored', (() => { c.setPixel(-1, 0); c.setPixel(384, 0); return c.rows[0].length === 48 })())
check('toBytes is height × 48', (() => { const cc = new Canvas(); cc.feed(4); return cc.toBytes().length === 4 * 48 })())

const rot = new Canvas()
rot.setPixel(0, 0)
rot.feed(0)
rot.rotate180()
check('rotate180 moves (0,0) to the far right of the row', rot.rows[0][47] === 0b10000000)

// --- 3. frames -------------------------------------------------------------
const f = frame(0xa1, Uint8Array.of(0x00))
check(
  'frame(0xA1, [0x00]) === 22 21 a1 00 01 00 00 00 ff',
  hex(f) === '22 21 a1 00 01 00 00 00 ff',
)
const f2 = frame(0xa9, Uint8Array.of(0x02, 0x00, 0x30, 0x01))
check('frame header/cmd/len are correct', f2[0] === 0x22 && f2[1] === 0x21 && f2[2] === 0xa9 && f2[4] === 0x04)
check('frame tail is FF', f2[f2.length - 1] === 0xff)
check('frame crc byte matches an independent crc8', f2[6 + 4] === crc8ref(Uint8Array.of(0x02, 0x00, 0x30, 0x01)))

// --- 4. notifications ------------------------------------------------------
function notifyBytes(cmd, payload) {
  const n = payload.length
  const outb = new Uint8Array(7 + n)
  outb[0] = 0x22
  outb[1] = 0x21
  outb[2] = cmd
  outb[3] = 0x00
  outb[4] = n & 0xff
  outb[5] = (n >> 8) & 0xff
  outb.set(payload, 6)
  outb[6 + n] = 0x00 // the single tail byte — NOT a checksum
  return outb
}
const parsed = parseNotification(notifyBytes(0xaa, Uint8Array.of(0x00, 0x42, 0x42)))
check('parseNotification reads cmd and payload', parsed && parsed.cmd === 0xaa && parsed.payload[1] === 0x42)
check('parseNotification rejects a bad header', parseNotification(Uint8Array.of(0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00)) === null)
check('parseNotification rejects a truncated payload', parseNotification(notifyBytes(0xa1, new Uint8Array(10)).slice(0, 8)) === null)

// --- 5. a full driver session against a fake printer -----------------------
function makeFakePrinter(opts = {}) {
  const {
    paperOk = true,
    temp = 25,
    errorFlag = 0,
    errorCode = 0,
    supply = 0x64,
    paperByte = null,
    statusLen = 10,
    corruptChecksum = false,
  } = opts
  const frames = []
  const dataLines = []
  let cb = () => {}
  let expectedCrc = 0
  const emit = (cmd, payload) => setTimeout(() => cb(notifyBytes(cmd, payload)), 0)
  const link = {
    isConnected: () => true,
    async writeControl(bytes) {
      frames.push(bytes)
      const cmd = bytes[2]
      if (cmd === 0xa1) {
        const p = new Uint8Array(statusLen)
        p[0] = 0
        p[3] = supply
        p[4] = temp
        p[6] = errorFlag
        if (p.length > 7) p[7] = errorCode
        if (p.length > 9) p[9] = paperByte ?? (paperOk ? 0x00 : 0x07)
        emit(0xa1, p)
      } else if (cmd === 0xa9) {
        emit(0xa9, Uint8Array.of(0x00))
      } else if (cmd === 0xad) {
        const crc = corruptChecksum ? (expectedCrc ^ 0xff) & 0xff : expectedCrc
        emit(0xaa, Uint8Array.of(0x00, crc, crc))
      } else if (cmd === 0xa3) {
        emit(0xa3, Uint8Array.of(0x00))
      }
    },
    async writeData(bytes) {
      dataLines.push(Uint8Array.from(bytes))
      expectedCrc = crc8ref(bytes, expectedCrc)
    },
    onNotification(fn) {
      cb = fn
    },
  }
  return { link, frames, dataLines }
}

function makeImage(lines) {
  const img = new Canvas()
  for (let i = 0; i < lines; i++) {
    for (let x = 0; x < 40; x++) img.setPixel((x * 7) % 384, i)
  }
  while (img.height < lines) img.feed(1)
  return img.toBytes()
}

// 5a. happy path
{
  const fake = makeFakePrinter()
  const session = new Mxw01PrintSession(fake.link)
  const img = makeImage(3)
  const result = await session.print(img, { feedLines: 0 })
  const cmds = fake.frames.map((fr) => fr[2])
  check('session writes A2 intensity → A1 status → A9 print → AD flush (no feed)',
    cmds.join(',') === '162,161,169,173')
  check('session sends exactly the image lines', fake.dataLines.length === 3 && fake.dataLines[0].length === 48)
  check('session reports ok with a matching checksum', result.ok && result.reported === result.expected)
  check('reported checksum equals crc8 of the image', result.expected === crc8ref(img))
  check('every sent line matches the source image', fake.dataLines.every((l, i) => hex(l) === hex(img.subarray(i * 48, i * 48 + 48))))
}

// 5b. feed command after the ticket
{
  const fake = makeFakePrinter()
  const session = new Mxw01PrintSession(fake.link)
  const result = await session.print(makeImage(1), { feedLines: 7 })
  const a3 = fake.frames.find((fr) => fr[2] === 0xa3)
  check('a nonzero feedLines sends an A3 feed frame', Boolean(a3) && a3[4] === 2 && a3[6] === 7 && a3[7] === 0)
  check('feed does not spoil the ok result', result.ok)
}

// 5c. checksum mismatch → not ok
{
  const fake = makeFakePrinter({ corruptChecksum: true })
  const session = new Mxw01PrintSession(fake.link)
  const result = await session.print(makeImage(2), { feedLines: 0 })
  check('a mismatched checksum reports ok=false', result.ok === false && result.reported !== result.expected)
}

// 5d. no paper
{
  const fake = makeFakePrinter({ paperOk: false })
  const session = new Mxw01PrintSession(fake.link)
  let threw = null
  try {
    await session.print(makeImage(1), { feedLines: 0 })
  } catch (e) {
    threw = e
  }
  check('an empty roll raises NoPaper before anything is sent', threw instanceof NoPaper)
  check('no paper prints nothing', fake.dataLines.length === 0)
  check('the empty-roll error carries the raw status bytes',
    threw && /\(status [0-9a-f]+\)/.test(threw.message))
}

// 5d-2. a battery-like byte at payload[9] is NOT a paper-out signal.
// Some units put the battery reading there; treating any non-zero as empty
// would fail every job. Only 0x07 (or the error flag + code) means empty.
{
  const fake = makeFakePrinter({ paperByte: 0x5d })
  const session = new Mxw01PrintSession(fake.link)
  const result = await session.print(makeImage(2), { feedLines: 0 })
  check('a non-zero battery byte at payload[9] still prints', result.ok && fake.dataLines.length === 2)
}

// 5d-3. the catprinter-style signal: error flag set with error code 9 = no paper
{
  const fake = makeFakePrinter({ errorFlag: 1, errorCode: 9 })
  const session = new Mxw01PrintSession(fake.link)
  let threw = null
  try {
    await session.print(makeImage(1), { feedLines: 0 })
  } catch (e) {
    threw = e
  }
  check('error flag + code 9 (no paper) raises NoPaper', threw instanceof NoPaper)
  check('the error-flag no-paper path prints nothing', fake.dataLines.length === 0)
}

// 5e. too hot
{
  const fake = makeFakePrinter({ temp: 50 })
  const session = new Mxw01PrintSession(fake.link)
  let threw = null
  try {
    await session.print(makeImage(1), { feedLines: 0 })
  } catch (e) {
    threw = e
  }
  check('a hot head raises TooHot and prints nothing', threw instanceof TooHot && fake.dataLines.length === 0)
}

// 5f. malformed image
{
  const fake = makeFakePrinter()
  const session = new Mxw01PrintSession(fake.link)
  let threw = null
  try {
    await session.print(new Uint8Array(10), { feedLines: 0 })
  } catch (e) {
    threw = e
  }
  check('a non-multiple-of-48 image is refused', threw instanceof PrinterError)
}

// 5g. a stalled line is retried and counted once
{
  const fake = makeFakePrinter()
  let call = 0
  const realWrite = fake.link.writeData.bind(fake.link)
  fake.link.writeData = async (bytes) => {
    call++
    if (call === 2) throw new Error('GATT queue full')
    await realWrite(bytes)
  }
  const session = new Mxw01PrintSession(fake.link)
  const result = await session.print(makeImage(2), { feedLines: 0 })
  check('a stalled write is retried and still verifies', result.ok && result.sent === 2 && session.stalls === 1)
}

// --- 6. composer -----------------------------------------------------------
const order = {
  id: 'ord_1',
  storeId: 'str_1',
  userId: 'usr_1',
  receiptNo: 'RCP-00042',
  items: [
    { productId: 'p1', name: 'Pork BBQ Stick', price: 25, qty: 2 },
    { productId: 'p2', name: 'Rice', price: 15, qty: 1 },
  ],
  subtotal: 65,
  discount: 0,
  total: 65,
  paymentStatus: 'paid',
  customerName: 'Juan Cruz',
  createdAt: '2026-10-11T10:30:00.000Z',
}

const test = buildRasterTest('Test Store')
check('self-test raster is a whole number of 48-byte lines', test.length > 0 && test.length % 48 === 0)
check('self-test raster contains ink', test.some((b) => b !== 0))

const receipt = buildRasterReceipt(order, { storeName: 'Dela Cruz BBQ House' })
check('receipt raster is a whole number of 48-byte lines', receipt.length > 0 && receipt.length % 48 === 0)
check('receipt raster contains ink', receipt.some((b) => b !== 0))

const compact = buildRasterReceipt(order, {
  storeName: 'Dela Cruz BBQ House',
  layout: { ...DEFAULT_RECEIPT_LAYOUT, headerStyle: 'compact' },
})
check('compact vs full header produce different rasters', hex(compact) !== hex(receipt))

const wide = buildRasterTest('Store', 576)
check('a 576-px raster is 72 bytes per line', wide.length % 72 === 0)

const unicode = buildRasterReceipt(
  { ...order, items: [{ productId: 'p', name: 'Café con leche 😀', price: 1, qty: 1 }] },
  { storeName: 'Café ☕' },
)
check('un-drawable characters do not crash the composer', unicode.length % 48 === 0 && unicode.length > 0)

const ruled = rasterize([{ rule: 'dash' }, { rule: 'solid' }, { text: 'AB', align: 'center' }])
check('rules + a text row render to whole lines', ruled.length % 48 === 0 && ruled.some((b) => b !== 0))

// ink should reach the far side of the sheet (the rules span the width)
const maxInkX = (() => {
  let max = 0
  for (let row = 0; row < ruled.length / 48; row++) {
    for (let x = 0; x < 384; x++) {
      if (ruled[row * 48 + (x >> 3)] & (1 << (x & 7))) if (x > max) max = x
    }
  }
  return max
})()
check('rules reach the far right of the 384-dot sheet', maxInkX > 340)

console.log(failures === 0 ? '\nAll raster checks passed' : `\n${failures} checks FAILED`)
process.exit(failures === 0 ? 0 : 1)
