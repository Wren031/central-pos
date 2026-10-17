import * as React from 'react'
import { Camera, CameraOff, Loader2, RefreshCw, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  cameraUnavailableReason,
  describeCameraError,
  listCameras,
  openCameraStream,
  stopStream,
  type CameraDevice,
} from '@/lib/camera'

/**
 * Live camera barcode scanner.
 *
 * The dialog owns the camera lifecycle (getUserMedia + track.stop()); ZXing is
 * only used to decode frames. This is deliberate:
 *   * We always stop the stream on close / unmount / device switch, so the lens
 *     is never left running and rapid re-opens can't race a stale `srcObject`.
 *   * A per-effect `cancelled` flag invalidates late async work (StrictMode
 *     double-invokes effects in dev), so a dead session only stops its OWN stream.
 *   * Capability checks run before touching getUserMedia, so insecure origins
 *     produce an actionable HTTPS/localhost message instead of a TypeError.
 *
 * Starts only when the dialog is open AND the video element exists, and stops on
 * close or unmount. `@zxing/browser` is imported lazily so it stays in its own
 * chunk (keeps the main bundle under the PWA precache limit).
 */
export function CameraScannerDialog({
  open,
  onOpenChange,
  onDetect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Return true when the code was handled — the dialog then closes itself. */
  onDetect: (code: string) => boolean
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  // Mirror of "is the element mounted?" so the stream effect can re-run once it is.
  const [hasVideo, setHasVideo] = React.useState(false)

  const [starting, setStarting] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [cameras, setCameras] = React.useState<CameraDevice[]>([])
  // The user's explicit choice (the Select value). null = use the default camera.
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null)
  // The camera actually attached to the current stream (for the Select label).
  const [activeDeviceId, setActiveDeviceId] = React.useState<string | null>(null)
  const [retryNonce, setRetryNonce] = React.useState(0)

  // Callback ref: store the element in a ref (safe to mutate) and flag mount.
  const attachVideo = React.useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    setHasVideo(el !== null)
  }, [])

  // Latest callbacks without restarting the stream on parent re-render.
  const onDetectRef = React.useRef(onDetect)
  React.useEffect(() => {
    onDetectRef.current = onDetect
  }, [onDetect])
  const onOpenChangeRef = React.useRef(onOpenChange)
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])

  // Ignore duplicate detections — the decoder fires on every decoded frame.
  const lastRef = React.useRef<{ code: string; at: number }>({ code: '', at: 0 })

  // Static "can we even try" verdict, computed once per mount.
  const unavailableReason = React.useMemo(() => cameraUnavailableReason(), [])

  React.useEffect(() => {
    if (!open) {
      // Reset so a fresh open starts clean.
      setSelectedDeviceId(null)
      setActiveDeviceId(null)
      setCameras([])
      setReady(false)
      setError(null)
      setStarting(false)
      return
    }

    const video = videoRef.current
    if (!video) return

    let stream: MediaStream | null = null
    let localControls: { stop: () => void } | null = null
    let cancelled = false

    setStarting(true)
    setReady(false)
    setError(null)
    setCameras([])
    lastRef.current = { code: '', at: 0 }

    // If the context can't do getUserMedia at all, fail fast with the real reason.
    if (unavailableReason) {
      setError(unavailableReason)
      setStarting(false)
      return
    }

    void (async () => {
      try {
        stream = await openCameraStream(selectedDeviceId)
        if (cancelled) {
          stopStream(stream)
          return
        }

        video.srcObject = stream
        // autoPlay attr + explicit play() for browsers that ignore it.
        try {
          await video.play()
        } catch {
          /* autoplay rejection is surfaced by the frame/readyState check */
        }

        const track = stream.getVideoTracks()[0]
        const activeId = track?.getSettings().deviceId ?? null
        if (!cancelled) setActiveDeviceId(activeId)

        // Labels are only populated after a grant — refresh the picker now.
        const devices = await listCameras()
        if (!cancelled) setCameras(devices)

        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled) {
          stopStream(stream)
          return
        }
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromStream(stream, video, (result) => {
          if (cancelled || !result) return
          const code = result.getText().trim()
          if (!code) return
          const now = Date.now()
          if (lastRef.current.code === code && now - lastRef.current.at < 1500) return
          lastRef.current = { code, at: now }
          if (onDetectRef.current(code)) onOpenChangeRef.current(false)
        })
        if (cancelled) {
          controls.stop()
          return
        }
        localControls = controls
      } catch (err) {
        if (!cancelled) {
          setError(describeCameraError(err))
          setStarting(false)
        }
        stopStream(stream)
      }
    })()

    return () => {
      cancelled = true
      try {
        localControls?.stop()
      } catch {
        /* already stopped */
      }
      stopStream(stream)
      try {
        video.srcObject = null
      } catch {
        /* element gone */
      }
    }
    // `hasVideo` (not the element) is the dep so the effect re-runs once mounted.
  }, [open, hasVideo, selectedDeviceId, retryNonce, unavailableReason])

  // Reflect a decoded/playing frame so the overlay clears only when video is real.
  function handleLoadedMetadata() {
    setReady(true)
    setStarting(false)
  }

  const selectValue = selectedDeviceId ?? activeDeviceId ?? cameras[0]?.deviceId ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-4" aria-hidden />
            Scan barcode
          </DialogTitle>
          <DialogDescription>Point the camera at the product barcode.</DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full overflow-hidden rounded-xl border bg-black">
          {/* autoPlay + muted + playsInline are all required for a live preview
              (autoplay policy and iOS inline playback). */}
          <video
            ref={attachVideo}
            className="size-full object-cover"
            autoPlay
            muted
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
          />
          {starting && !ready && !error && (
            <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-sm text-white">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Starting camera…
            </span>
          )}
          {error && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-sm text-white">
              <CameraOff className="size-6" aria-hidden />
              <span>{error}</span>
              {!unavailableReason && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setRetryNonce((n) => n + 1)}
                >
                  <RefreshCw className="size-3.5" />
                  Retry
                </Button>
              )}
            </span>
          )}
          {!starting && ready && !error && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-red-500/80 shadow-[0_0_12px_2px_rgba(239,68,68,0.7)]"
            />
          )}
        </div>

        {cameras.length > 1 && !error && (
          <div className="flex items-center gap-2">
            <Camera className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Select value={selectValue} onValueChange={(v) => setSelectedDeviceId(v)}>
              <SelectTrigger className="w-full" aria-label="Select camera">
                <SelectValue placeholder="Select a camera" />
              </SelectTrigger>
              <SelectContent>
                {cameras.map((c) => (
                  <SelectItem key={c.deviceId} value={c.deviceId}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
