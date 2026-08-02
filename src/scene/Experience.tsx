import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { exposeDebugGlobals } from '../debug/exposeForTesting'
import { PhysicsScene } from '../physics/PhysicsScene'
import { useStrawMobileStore } from '../state/store'
import { BuildScene } from './BuildScene'
import { setCanvasBridge } from './canvasBridge'

/** Top-level 3D canvas: lighting, camera, and the build/simulate scene switch. */
export function Experience() {
  const mode = useStrawMobileStore((s) => s.mode)
  const selectShape = useStrawMobileStore((s) => s.selectShape)

  return (
    <Canvas
      shadows
      camera={{ position: [6.5, 4.5, 8], fov: 42 }}
      onCreated={(state) => {
        setCanvasBridge(state.camera, state.gl.domElement)
        exposeDebugGlobals(state.camera, state.size)
      }}
      onPointerMissed={() => {
        if (mode === 'build') selectShape(null)
      }}
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
      {mode === 'build' ? <BuildScene /> : <PhysicsScene />}
      <OrbitControls target={[0, 2, 0]} enableDamping makeDefault />
    </Canvas>
  )
}
