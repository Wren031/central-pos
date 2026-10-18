/**
 * Camera plumbing for the barcode scanner.
 *
 * Kept separate from the dialog so device enumeration, constraint fallback, and
 * error → message mapping are pure and testable.
 *
 * The camera is attempted directly — there is no pre-emptive "needs HTTPS or
 * localhost" gate. If the browser can't provide a stream, the error is mapped to
 * a clear message by `describeCameraError`.
 */

export interface CameraDevice {
  deviceId: string
  label: string
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
  // Attempt the camera directly. Only guard against the API being genuinely
  // absent (old browsers / a context that exposes no mediaDevices) so the caller
  // gets a readable message instead of a raw TypeError.
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    throw new Error('Camera access is not available in this browser.')
  }

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
  // A plain Error (no DOMException name) already carries a readable message.
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
