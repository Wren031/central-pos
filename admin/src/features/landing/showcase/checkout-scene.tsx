import * as React from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, RoundedBox } from '@react-three/drei'
import {
  createBlankTexture,
  createTexture,
  drawBarcode,
  drawReceipt,
  drawScreen,
  redrawTexture,
  SCANNED_BARCODE,
} from './textures'

/* -------------------------------------------------------------------------- */
/* Scene layout (world units)                                                   */
/* -------------------------------------------------------------------------- */

const SHELL = '#dbe2ee'
const SHELL_DEEP = '#c7d0e0'
const PRINTER_SHELL = '#b7c2d6'
const FRAME = '#171a24'
const METAL = '#9aa4b6'

/** Horizontal centre of the whole arrangement — the camera is centred on it. */
const CENTER_X = -0.2

const TERMINAL_X = -0.15
const TERMINAL_Y = 0.55
const SCREEN_W = 3.46
const SCREEN_H = 2.1625

const PRODUCT_X = -2.3
const PRODUCT_Y = -0.68
const PRODUCT_Z = 1.3
const BARCODE_TARGET = new THREE.Vector3(PRODUCT_X, PRODUCT_Y - 0.02, PRODUCT_Z + 0.24)

const PRINTER_POS: [number, number, number] = [2.2, -0.65, -0.05]
const PRINTER_SIZE: [number, number, number] = [1.1, 1.0, 0.85]
/** Top face of the printer — where the receipt emerges. */
const SLOT_Y = PRINTER_POS[1] + PRINTER_SIZE[1] / 2

const PAPER_W = 1.0
const PAPER_H = 1.55

const SCANNER_REST = new THREE.Vector3(1.55, 1.4, 1.1)
const SCANNER_SCAN = new THREE.Vector3(-2.0, 0.1, 1.9)
const SCANNER_REST_TARGET = new THREE.Vector3(1.0, 1.05, 0.4)

const CARD_OUT = new THREE.Vector3(3.6, 0.8, 1.2)
const CARD_IN = new THREE.Vector3(1.3, 0.05, 0.45)

const UP = new THREE.Vector3(0, 1, 0)

/**
 * World-space box the camera always keeps fully in frame. Sized from the
 * outermost geometry *including* perspective magnification (the product and
 * printer sit in front of z=0, so they project wider than their raw x extent).
 */
const FIT_WIDTH = 7.4
const FIT_HEIGHT = 3.6
/** Vertical centre of the arrangement — the camera looks straight at it. */
const LOOK_Y = 0.3

/* -------------------------------------------------------------------------- */
/* Camera that always frames the arrangement                                    */
/* -------------------------------------------------------------------------- */

function FrameContent() {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)

  React.useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    const halfFov = Math.tan(((camera.fov * Math.PI) / 180) / 2)
    const distanceForHeight = FIT_HEIGHT / 2 / halfFov
    const distanceForWidth = FIT_WIDTH / 2 / (halfFov * aspect)
    const distance = Math.max(distanceForHeight, distanceForWidth) * 1.05
    camera.position.set(CENTER_X, 0.55, distance)
    camera.lookAt(CENTER_X, LOOK_Y, 0)
    camera.updateProjectionMatrix()
  }, [camera, size])

  return null
}

/* -------------------------------------------------------------------------- */
/* Screen surface — a canvas texture redrawn only when the step changes         */
/* -------------------------------------------------------------------------- */

function ScreenSurface({ step }: { step: number }) {
  const texture = React.useMemo(() => createBlankTexture(1024, 640), [])

  // Layout effect so the screen is drawn before the first WebGL frame.
  React.useLayoutEffect(() => {
    redrawTexture(texture, (ctx, w, h) => drawScreen(ctx, w, h, step))
  }, [texture, step])

  React.useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={[TERMINAL_X, TERMINAL_Y, 0.185]}>
      <planeGeometry args={[SCREEN_W, SCREEN_H]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

/* -------------------------------------------------------------------------- */
/* Animated POS setup                                                           */
/* -------------------------------------------------------------------------- */

function AnimatedScene({ step }: { step: number }) {
  const scanner = React.useRef<THREE.Group>(null)
  const emitter = React.useRef<THREE.Object3D>(null)
  const beam = React.useRef<THREE.Mesh>(null)
  const beamMaterial = React.useRef<THREE.MeshBasicMaterial>(null)
  const beamLight = React.useRef<THREE.PointLight>(null)
  const scanLine = React.useRef<THREE.Mesh>(null)
  const scanLineMaterial = React.useRef<THREE.MeshBasicMaterial>(null)
  const product = React.useRef<THREE.Group>(null)
  const ring = React.useRef<THREE.Mesh>(null)
  const ringMaterial = React.useRef<THREE.MeshBasicMaterial>(null)
  const badge = React.useRef<THREE.Group>(null)
  const card = React.useRef<THREE.Group>(null)
  const cardMaterial = React.useRef<THREE.MeshStandardMaterial>(null)
  const paper = React.useRef<THREE.Group>(null)

  const approach = React.useRef(0)
  const cardIn = React.useRef(0)
  const rise = React.useRef(0)
  const stepRef = React.useRef(step)
  const stepStart = React.useRef(0)

  const tmpTarget = React.useMemo(() => new THREE.Vector3(), [])
  const tmpEmitter = React.useMemo(() => new THREE.Vector3(), [])
  const tmpDir = React.useMemo(() => new THREE.Vector3(), [])

  const barcodeTexture = React.useMemo(
    () =>
      createTexture(512, 224, (ctx, w, h) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        drawBarcode(ctx, 40, 34, w - 80, h - 68, SCANNED_BARCODE)
      }),
    []
  )

  const receiptTexture = React.useMemo(
    () => createTexture(512, 780, (ctx, w, h) => drawReceipt(ctx, w, h)),
    []
  )

  const clipPlane = React.useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -SLOT_Y),
    []
  )

  React.useEffect(
    () => () => {
      barcodeTexture.dispose()
      receiptTexture.dispose()
    },
    [barcodeTexture, receiptTexture]
  )

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.06)
    const clock = state.clock.elapsedTime

    if (stepRef.current !== step) {
      stepRef.current = step
      stepStart.current = clock
    }
    const t = clock - stepStart.current

    /* ---------- Scanner approach ---------- */
    approach.current = THREE.MathUtils.damp(approach.current, step === 1 ? 1 : 0, 5.5, dt)
    const k = approach.current

    if (scanner.current) {
      scanner.current.position.lerpVectors(SCANNER_REST, SCANNER_SCAN, k)
      scanner.current.position.y += (1 - k) * Math.sin(clock * 1.1) * 0.03
      tmpTarget.lerpVectors(SCANNER_REST_TARGET, BARCODE_TARGET, k)
      scanner.current.lookAt(tmpTarget)
    }

    /* ---------- Beam from the scanner head to the barcode ---------- */
    if (emitter.current && beam.current && beamMaterial.current) {
      emitter.current.getWorldPosition(tmpEmitter)
      const distance = tmpEmitter.distanceTo(BARCODE_TARGET)
      beam.current.position.copy(tmpEmitter).lerp(BARCODE_TARGET, 0.5)
      tmpDir.subVectors(BARCODE_TARGET, tmpEmitter).normalize()
      beam.current.quaternion.setFromUnitVectors(UP, tmpDir)
      beam.current.scale.set(1, distance, 1)
      beamMaterial.current.opacity = 0.45 * k
      beam.current.visible = k > 0.02
      if (beamLight.current) beamLight.current.intensity = 3.2 * k
    }

    /* ---------- Laser line sweeping across the barcode ---------- */
    if (scanLine.current && scanLineMaterial.current) {
      const finished = step === 1 && t > 2.1
      const sweep = Math.min(1, ((t % 1.5) / 1.05) % 1)
      scanLine.current.position.x = BARCODE_TARGET.x - 0.34 + 0.68 * sweep
      scanLineMaterial.current.opacity = finished ? 0 : 0.95 * k
    }

    /* ---------- Scan-confirmed badge ---------- */
    if (badge.current) {
      const show = (step === 1 && t > 2.15) || step === 2
      const scale = THREE.MathUtils.damp(badge.current.scale.x, show ? 1 : 0.0001, 7, dt)
      badge.current.scale.setScalar(scale)
      badge.current.position.y = PRODUCT_Y + 0.78 + (1 - scale) * -0.18
    }

    /* ---------- Product hop as it drops into the cart ---------- */
    if (product.current) {
      const hop = step === 2 && t < 0.7 ? Math.sin((t / 0.7) * Math.PI) * 0.22 : 0
      product.current.position.y = THREE.MathUtils.damp(
        product.current.position.y,
        PRODUCT_Y + hop,
        9,
        dt
      )
    }

    /* ---------- Selection ring under the product ---------- */
    if (ring.current && ringMaterial.current) {
      const active = step === 0 || step === 1
      const pulse = 0.4 + Math.sin(clock * 3.1) * 0.16
      ringMaterial.current.opacity = THREE.MathUtils.damp(
        ringMaterial.current.opacity,
        active ? pulse : 0,
        6,
        dt
      )
      ring.current.scale.setScalar(active ? 1 + Math.sin(clock * 3.1) * 0.03 : 1)
    }

    /* ---------- Payment card tapping the terminal ---------- */
    if (card.current && cardMaterial.current) {
      const phase = step === 3 ? (t < 0.5 ? 0 : t < 1.7 ? 1 : 0) : 0
      cardIn.current = THREE.MathUtils.damp(cardIn.current, phase, 4.5, dt)
      card.current.position.lerpVectors(CARD_OUT, CARD_IN, cardIn.current)
      card.current.rotation.z = -0.25 + cardIn.current * 0.25
      cardMaterial.current.opacity = step === 3 ? Math.max(cardIn.current, 0.001) : 0
      card.current.visible = cardMaterial.current.opacity > 0.02
    }

    /* ---------- Receipt feeding out of the printer ---------- */
    if (paper.current) {
      const target = step === 4 ? Math.min(1, t / 1.7) : 0
      rise.current = THREE.MathUtils.damp(rise.current, target, step === 4 ? 6 : 8, dt)
      paper.current.position.y = -PAPER_H * (1 - rise.current)
      paper.current.rotation.z = Math.sin(clock * 1.4) * 0.008 * rise.current
    }
  })

  return (
    <group>
      <FrameContent />

      {/* ---------- Terminal ---------- */}
      <RoundedBox
        args={[3.9, 2.5, 0.26]}
        radius={0.1}
        smoothness={3}
        position={[TERMINAL_X, TERMINAL_Y, 0]}
      >
        <meshStandardMaterial color={SHELL} roughness={0.62} metalness={0.08} />
      </RoundedBox>
      <RoundedBox
        args={[SCREEN_W + 0.16, SCREEN_H + 0.16, 0.06]}
        radius={0.06}
        smoothness={3}
        position={[TERMINAL_X, TERMINAL_Y, 0.14]}
      >
        <meshStandardMaterial color={FRAME} roughness={0.35} metalness={0.25} />
      </RoundedBox>
      <RoundedBox
        args={[0.4, 0.8, 0.3]}
        radius={0.08}
        smoothness={3}
        position={[TERMINAL_X, -0.6, -0.02]}
      >
        <meshStandardMaterial color={SHELL_DEEP} roughness={0.6} metalness={0.1} />
      </RoundedBox>
      <mesh position={[TERMINAL_X, -1.11, 0]}>
        <cylinderGeometry args={[0.66, 0.74, 0.09, 40]} />
        <meshStandardMaterial color={METAL} roughness={0.42} metalness={0.6} />
      </mesh>
      <ScreenSurface step={step} />
      <pointLight position={[TERMINAL_X, TERMINAL_Y, 1.15]} intensity={2.6} distance={4.5} color="#93a4ff" />

      {/* ---------- Product with barcode ---------- */}
      <mesh position={[PRODUCT_X, -1.135, PRODUCT_Z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.46, 0.57, 48]} />
        <meshBasicMaterial
          ref={ringMaterial}
          color="#6366f1"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <group ref={product} position={[PRODUCT_X, PRODUCT_Y, PRODUCT_Z]}>
        <RoundedBox args={[0.92, 0.92, 0.46]} radius={0.05} smoothness={3}>
          <meshStandardMaterial color="#e8edf6" roughness={0.55} metalness={0.05} />
        </RoundedBox>
        <mesh position={[0, -0.02, 0.24]}>
          <planeGeometry args={[0.74, 0.33]} />
          <meshBasicMaterial map={barcodeTexture} toneMapped={false} />
        </mesh>
      </group>

      {/* ---------- Scan-confirmed badge ---------- */}
      <group
        ref={badge}
        scale={0.0001}
        position={[PRODUCT_X, PRODUCT_Y + 0.78, PRODUCT_Z + 0.3]}
      >
        <mesh>
          <circleGeometry args={[0.23, 32]} />
          <meshBasicMaterial color="#10b981" toneMapped={false} />
        </mesh>
        <mesh position={[-0.05, -0.01, 0.012]} rotation={[0, 0, -0.75]}>
          <boxGeometry args={[0.045, 0.14, 0.01]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <mesh position={[0.04, 0.02, 0.012]} rotation={[0, 0, 0.65]}>
          <boxGeometry args={[0.045, 0.22, 0.01]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      </group>

      {/* ---------- Handheld scanner ---------- */}
      <group ref={scanner} position={SCANNER_REST}>
        <RoundedBox args={[0.24, 0.46, 0.24]} radius={0.06} smoothness={3}>
          <meshStandardMaterial color="#232834" roughness={0.4} metalness={0.3} />
        </RoundedBox>
        <RoundedBox args={[0.34, 0.2, 0.34]} radius={0.05} smoothness={3} position={[0, -0.3, 0.04]}>
          <meshStandardMaterial color="#2c313d" roughness={0.35} metalness={0.35} />
        </RoundedBox>
        <RoundedBox args={[0.3, 0.16, 0.22]} radius={0.05} smoothness={3} position={[0, 0.3, 0]}>
          <meshStandardMaterial color="#4f46e5" roughness={0.35} metalness={0.2} />
        </RoundedBox>
        <object3D ref={emitter} position={[0, -0.34, 0.1]} />
        <pointLight
          ref={beamLight}
          position={[0, -0.42, 0.18]}
          intensity={0}
          distance={3}
          color="#ff5a5a"
        />
      </group>

      <mesh ref={beam} visible={false}>
        <cylinderGeometry args={[0.13, 0.02, 1, 20, 1, true]} />
        <meshBasicMaterial
          ref={beamMaterial}
          color="#ff4d4d"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        ref={scanLine}
        position={[BARCODE_TARGET.x, BARCODE_TARGET.y, BARCODE_TARGET.z + 0.006]}
      >
        <planeGeometry args={[0.022, 0.38]} />
        <meshBasicMaterial
          ref={scanLineMaterial}
          color="#ff3b3b"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* ---------- Payment card ---------- */}
      <group ref={card} visible={false} position={CARD_OUT}>
        <RoundedBox args={[0.62, 0.4, 0.02]} radius={0.04} smoothness={3}>
          <meshStandardMaterial
            ref={cardMaterial}
            color="#2563eb"
            roughness={0.4}
            metalness={0.2}
            transparent
            opacity={0}
          />
        </RoundedBox>
      </group>

      {/* ---------- Thermal printer ---------- */}
      <group position={PRINTER_POS}>
        <RoundedBox args={PRINTER_SIZE} radius={0.08} smoothness={3}>
          <meshStandardMaterial color={PRINTER_SHELL} roughness={0.58} metalness={0.12} />
        </RoundedBox>
        {/* Paper slot, centred on the top face */}
        <RoundedBox args={[0.8, 0.08, 0.24]} radius={0.03} smoothness={3} position={[0, 0.47, 0.1]}>
          <meshStandardMaterial color={FRAME} roughness={0.4} metalness={0.2} />
        </RoundedBox>
        {/* Status light on the front face */}
        <mesh position={[0.33, 0.3, 0.427]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.02, 20]} />
          <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={1.6} />
        </mesh>
      </group>

      {/* ---------- Receipt paper (clipped so it feeds out of the slot) ---------- */}
      <group ref={paper} position={[PRINTER_POS[0], SLOT_Y, PRINTER_POS[2] + 0.12]}>
        {/* Soft drop shadow so the white paper reads against the light stage */}
        <mesh position={[0.02, PAPER_H / 2 - 0.02, -0.008]}>
          <planeGeometry args={[PAPER_W + 0.04, PAPER_H + 0.04]} />
          <meshBasicMaterial
            color="#2b3550"
            transparent
            opacity={0.18}
            depthWrite={false}
            side={THREE.DoubleSide}
            clippingPlanes={[clipPlane]}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, PAPER_H / 2, 0]}>
          <planeGeometry args={[PAPER_W, PAPER_H]} />
          <meshStandardMaterial
            map={receiptTexture}
            roughness={0.92}
            metalness={0}
            side={THREE.DoubleSide}
            clippingPlanes={[clipPlane]}
            toneMapped={false}
          />
        </mesh>
      </group>

      <ContactShadows
        position={[CENTER_X, -1.146, 0.3]}
        scale={8.5}
        opacity={0.42}
        blur={2.8}
        far={2.6}
        resolution={256}
        color="#16213a"
      />
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/* Canvas                                                                       */
/* -------------------------------------------------------------------------- */

export default function CheckoutScene({
  step,
  active,
  onReady,
}: {
  step: number
  active: boolean
  onReady?: () => void
}) {
  const isSmall = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
    []
  )

  return (
    <Canvas
      flat
      dpr={[1, isSmall ? 1.5 : 2]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [CENTER_X, 0.55, 10], fov: 28, near: 0.1, far: 60 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
        onReady?.()
      }}
      style={{ pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#ffffff', '#c8cfe0', 0.65]} />
      <directionalLight position={[4.5, 6, 6]} intensity={1.35} />
      <directionalLight position={[-6, 2.5, 3]} intensity={0.5} color="#dfe6ff" />
      <directionalLight position={[0, 1, -6]} intensity={0.32} />
      <AnimatedScene step={step} />
    </Canvas>
  )
}
