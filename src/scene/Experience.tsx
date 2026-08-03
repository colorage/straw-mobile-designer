import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { exposeDebugGlobals } from '../debug/exposeForTesting'
import { PhysicsScene } from '../physics/PhysicsScene'
import { usePhysicsPersistence } from '../physics/usePhysicsPersistence'
import { useStrawMobileStore } from '../state/store'
import { setCameraView } from './cameraView'
import { setCanvasBridge } from './canvasBridge'
import { detectSoftwareGL, useSoftwareGL } from './renderCapability'

const GRID_Y = -3.2
const SHADOW_FLOOR_Y = -3.19

const ORBIT_TARGET: [number, number, number] = [0, 2, 0]

/**
 * Keeps the shared camera view in sync with the live camera + orbit target,
 * and owns the default OrbitControls instance.
 *
 * The orbit target is applied once on mount (not as a declarative prop) so
 * React re-renders cannot reset the look-at while the user is panning.
 */
function CameraViewSync() {
  const camera = useThree((s) => s.camera)
  const get = useThree((s) => s.get)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  useFrame(() => {
    const controls = controlsRef.current ?? (get().controls as OrbitControlsImpl | null)
    if (controls?.target) {
      setCameraView(camera, controls.target)
    } else {
      setCameraView(camera)
    }
  })

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.target.set(...ORBIT_TARGET)
    controls.enabled = true
    controls.update()
    // onCreated runs before makeDefault attaches controls — refresh debug handle.
    const debug = (window as unknown as { __strawDebug?: { controls?: unknown } }).__strawDebug
    if (debug) debug.controls = controls
  }, [])

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      makeDefault
      onChange={() => {
        const controls = controlsRef.current
        if (controls?.target) setCameraView(camera, controls.target)
      }}
    />
  )
}

/**
 * PivotControls sets `controls.enabled = false` while a gizmo is dragged. If
 * pointerup is missed (released outside the window), orbit stays dead. Restore
 * on window-level pointerup/cancel after drei's own handler runs.
 */
function OrbitEnabledGuard() {
  const get = useThree((s) => s.get)

  useEffect(() => {
    const restore = () => {
      requestAnimationFrame(() => {
        const controls = get().controls as OrbitControlsImpl | null
        if (controls) controls.enabled = true
      })
    }
    window.addEventListener('pointerup', restore)
    window.addEventListener('pointercancel', restore)
    return () => {
      window.removeEventListener('pointerup', restore)
      window.removeEventListener('pointercancel', restore)
    }
  }, [get])

  return null
}

/** Dark workbench plane that catches directional shadows under the hanging mobile. */
function ShadowFloor() {
  const softwareGL = useSoftwareGL()
  if (softwareGL) return null

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SHADOW_FLOOR_Y, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color="#141622" roughness={1} metalness={0} />
    </mesh>
  )
}

/** Top-level 3D canvas: lighting, camera, and the unified edit/gravity scene. */
export function Experience() {
  const selectShape = useStrawMobileStore((s) => s.selectShape)
  usePhysicsPersistence()

  return (
    <Canvas
      shadows
      gl={{ preserveDrawingBuffer: true }}
      camera={{ position: [6.5, 4.5, 8], fov: 42 }}
      onCreated={(state) => {
        detectSoftwareGL(state.gl)
        setCanvasBridge(state.camera, state.gl.domElement, state.gl, state.scene)
        setCameraView(state.camera, { x: 0, y: 2, z: 0 })
        exposeDebugGlobals(state.camera, state.size, {
          scene: state.scene,
          gl: state.gl,
          controls: state.controls,
        })
      }}
      onPointerMissed={() => selectShape(null)}
    >
      <color attach="background" args={['#11131a']} />
      <fog attach="fog" args={['#11131a', 45, 120]} />
      <ambientLight intensity={0.22} />
      <hemisphereLight intensity={0.65} groundColor="#20222c" />
      <directionalLight
        position={[5, 9, 4]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={28}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0002}
      />
      <ShadowFloor />
      <Grid
        position={[0, GRID_Y, 0]}
        args={[40, 40]}
        cellColor="#262a37"
        sectionColor="#3a4054"
        fadeDistance={90}
        infiniteGrid
      />
      {/* Physics no longer suspends — see vite.config.ts rapierSyncPhysicsPlugin. */}
      <PhysicsScene />
      <CameraViewSync />
      <OrbitEnabledGuard />
    </Canvas>
  )
}
