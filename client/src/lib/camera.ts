/**
 * Camera plumbing for the barcode scanner.
 *
 * Kept separate from the dialog so the capability checks, device enumeration,
 * constraint fallback, and error → message mapping are pure and testable — and
 * so the UI never shows a raw `TypeError: ... getUserMedia of undefined`.
 *
 * Root causes this guards against:
 *   * Insecure origin (plain http:// LAN URL): `navigator.mediaDevices` is
 *     undefined entirely, so any direct getUserMedia call throws a TypeError.
 *   * Device without a camera: `getUserMedia` rejects with NotFoundError.
 *   * Permission blocked / missing (notably the Android manifest): NotAllowedError.
 */

export interface CameraDevice {
  deviceId: string
  label: string
}

/** Can this context even attempt getUserMedia? (secure context + API present) */
export function isCameraSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (!window.isSecureContext) return false
  return typeof navigator.mediaDevices?.getUserMedia === 'function'
}

/** True only for the insecure-origin case (so we can show the specific fix). */
export function isInsecureOrigin(): boolean {
  if (typeof window === 'undefined') return false
  return !window.isSecureContext
}

/** The current page origin, for a self-diagnosing message. */
function currentOrigin(): string {
  if (typeof window === 'undefined' || !window.location) return 'this address'
  return window.location.origin
}

/**
 * Human-readable reason the camera can't be used at all, or null when it can.
 * Covers the two "before you even try" branches distinctly, and names the
 * actual origin so an insecure-origin block is self-explanatory.
 */
export function cameraUnavailableReason(): string | null {
  const origin = currentOrigin()
  const insecureMessage =
    `Camera access is blocked on ${origin} because it isn't a secure context. ` +
    'Open the app over https:// (or http://localhost on the device) — browsers only allow the camera on secure origins.'
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    if (isInsecureOrigin()) return insecureMessage
    return 'This browser does not support camera access (no mediaDevices API).'
  }
  if (!isCameraSupported()) return insecureMessage
  return null
}

/** Enumerate available video input devices (labels are blank until permission granted). */
export async function listCameras(): Promise<CameraDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return []
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }))
  } catch {
    return []
  }
}

/** Prefer a rear/environment camera by its label when nothing is chosen yet. */
function preferredCamera(devices: CameraDevice[]): CameraDevice | null {
  if (devices.length === 0) return null
  const rear = devices.find((d) => /back|rear|environment/i.test(d.label))
  return rear ?? devices[0]
}

/** Ordered constraint attempts: exact device → environment → any video. */
function constraintCandidates(deviceId?: string | null): MediaStreamConstraints[] {
  const candidates: MediaStreamConstraints[] = []
  if (deviceId) {
    candidates.push({ video: { deviceId: { exact: deviceId } }, audio: false })
  }
  candidates.push({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  candidates.push({ video: true, audio: false })
  return candidates
}

/**
 * Open the camera, falling back through progressively looser constraints so a
 * missing exact device or an OverconstrainedError still yields a working stream.
 * Throws the LAST error when every attempt fails (callers map it for display).
 */
export async function openCameraStream(deviceId?: string | null): Promise<MediaStream> {
  const reason = cameraUnavailableReason()
  if (reason) throw new Error(reason)

  let lastError: unknown = null
  for (const constraints of constraintCandidates(deviceId)) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      lastError = err
      // Permission denial / no camera won't be fixed by looser constraints.
      const name = (err as { name?: string } | null)?.name
      if (name === 'NotAllowedError' || name === 'NotFoundError' || name === 'SecurityError') {
        throw err
      }
    }
  }
  throw lastError ?? new Error('Could not open the camera.')
}

/** Stop every track on a stream (safe with null). */
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      /* already stopped */
    }
  }
}

/** First camera to use: an explicit choice, else the rear/environment one. */
export async function resolveInitialCamera(deviceId?: string | null): Promise<string | null> {
  if (deviceId) return deviceId
  const devices = await listCameras()
  return preferredCamera(devices)?.deviceId ?? null
}

/** Map a getUserMedia/Zxing failure to clear, actionable copy. */
export function describeCameraError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? ''
  // Our own thrown Error (insecure-origin / capability message) uses the default
  // "Error" name and already reads well — surface it verbatim.
  if (err instanceof Error && (name === '' || name === 'Error')) {
    return err.message
  }
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was blocked. Allow camera access for this app in your device/browser settings, then tap Retry.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this device. Choose the USB barcode scanner instead.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is already in use by another app. Close it and tap Retry.'
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'This camera does not support the requested mode. Pick a different camera.'
    case 'AbortError':
      return 'The camera could not start. Tap Retry.'
    default:
      return err instanceof Error && err.message
        ? err.message
        : 'The camera could not be started. Tap Retry.'
  }
}
