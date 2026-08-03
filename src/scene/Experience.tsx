import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { Suspense, useEffect, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { exposeDebugGlobals } from '../debug/exposeForTesting'
import { PhysicsScene } from '../physics/PhysicsScene'
import { usePhysicsPersistence } from '../physics/usePhysicsPersistence'
import { useStrawMobileStore } from '../state/store'
import { setCameraView } from './cameraView'
import { setCanvasBridge } from './canvasBridge'

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

/** Top-level 3D canvas: lighting, camera, and the unified edit/gravity scene. */
export function Experience() {
  const selectShape = useStrawMobileStore((s) => s.selectShape)
  usePhysicsPersistence()

  return (
    <Canvas
      shadows
      camera={{ position: [6.5, 4.5, 8], fov: 42 }}
      onCreated={(state) => {
        setCanvasBridge(state.camera, state.gl.domElement)
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
      <fog attach="fog" args={['#11131a', 14, 32]} />
      <hemisphereLight intensity={0.7} groundColor="#20222c" />
      <directionalLight
        position={[5, 9, 4]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <Grid
        position={[0, -3.2, 0]}
        args={[40, 40]}
        cellColor="#262a37"
        sectionColor="#3a4054"
        fadeDistance={26}
        infiniteGrid
      />
      {/*
        Rapier's <Physics> suspends while WASM loads. If that suspend hits the
        Canvas root Suspense boundary, the whole scene (grid, lights, controls)
        unmounts and never recovers cleanly — blank clear-color canvas.
        Keep Physics in its own boundary so the rest of the scene stays up.
      */}
      <Suspense fallback={null}>
        <PhysicsScene />
      </Suspense>
      <CameraViewSync />
      <OrbitEnabledGuard />
    </Canvas>
  )
}
