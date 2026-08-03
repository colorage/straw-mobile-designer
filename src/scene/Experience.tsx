import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { Suspense, useRef } from 'react'
import { exposeDebugGlobals } from '../debug/exposeForTesting'
import { PhysicsScene } from '../physics/PhysicsScene'
import { usePhysicsPersistence } from '../physics/usePhysicsPersistence'
import { useStrawMobileStore } from '../state/store'
import { setCameraView } from './cameraView'
import { setCanvasBridge } from './canvasBridge'

type OrbitControlsLike = {
  target: { x: number; y: number; z: number }
}

/** Keeps the shared camera view in sync with the live camera + orbit target. */
function CameraViewSync() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsLike | null
  const controlsRef = useRef<OrbitControlsLike | null>(null)

  useFrame(() => {
    const activeControls = controlsRef.current ?? controls
    if (activeControls?.target) {
      setCameraView(camera, activeControls.target)
    } else {
      setCameraView(camera)
    }
  })

  return (
    <OrbitControls
      // drei's OrbitControls ref is the underlying controls instance
      ref={controlsRef as never}
      target={[0, 2, 0]}
      enableDamping
      makeDefault
      onChange={() => {
        const activeControls = controlsRef.current
        if (activeControls?.target) {
          setCameraView(camera, activeControls.target)
        }
      }}
    />
  )
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
        exposeDebugGlobals(state.camera, state.size)
      }}
      onPointerMissed={() => selectShape(null)}
    >
      <color attach="background" args={['#11131a']} />
      <fog attach="fog" args={['#11131a', 14, 32]} />
      <hemisphereLight intensity={0.55} groundColor="#20222c" />
      <directionalLight
        position={[5, 9, 4]}
        intensity={1.3}
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
    </Canvas>
  )
}
