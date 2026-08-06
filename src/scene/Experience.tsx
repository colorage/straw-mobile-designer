import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { exposeDebugGlobals } from '../debug/exposeForTesting'
import { PhysicsScene } from '../physics/PhysicsScene'
import { usePhysicsPersistence } from '../physics/usePhysicsPersistence'
import { useStrawMobileStore } from '../state/store'
import { useThemeStore } from '../state/themeStore'
import { setCameraView } from './cameraView'
import { setCanvasBridge } from './canvasBridge'
import { MarqueeSelectController } from './MarqueeSelectController'
import { consumeGizmoClick } from './gizmoDrag'
import { consumeMarqueeClick } from './marqueeSelect'
import { detectSoftwareGL } from './renderCapability'

const SCENE_THEME = {
  dark: {
    background: '#11131a',
    ground: '#20222c',
    cell: '#262a37',
    section: '#3a4054',
    ambient: 0.22,
    hemisphere: 0.65,
    directional: 1.2,
  },
  light: {
    background: '#e8eaf1',
    ground: '#c5cad8',
    cell: '#c8cedc',
    section: '#9aa3ba',
    ambient: 0.45,
    hemisphere: 0.85,
    directional: 1.05,
  },
} as const

const GRID_Y = -3.2

const ORBIT_TARGET: [number, number, number] = [0, 2, 0]

/**
 * Keeps the shared camera view in sync with the live camera + orbit target,
 * and owns the default OrbitControls instance.
 *
 * The orbit target is applied once on mount (not as a declarative prop) so
 * React re-renders cannot reset the look-at while the user is panning.
 * Orbit is disabled while the selection tool is active (marquee / click select).
 */
function CameraViewSync() {
  const camera = useThree((s) => s.camera)
  const get = useThree((s) => s.get)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const selectActive = useStrawMobileStore((s) => s.activeTool === 'select')

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
    controls.enabled = !selectActive
    controls.update()
    // onCreated runs before makeDefault attaches controls — refresh debug handle.
    const debug = (window as unknown as { __strawDebug?: { controls?: unknown } }).__strawDebug
    if (debug) debug.controls = controls
  }, [selectActive])

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={!selectActive}
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
 * Object-move drags set `controls.enabled = false` while active. If
 * pointerup is missed (released outside the window), orbit stays dead. Restore
 * on window-level pointerup/cancel after the drag handler runs — but keep
 * orbit off while the selection tool owns the pointer.
 */
function OrbitEnabledGuard() {
  const get = useThree((s) => s.get)

  useEffect(() => {
    const restore = () => {
      requestAnimationFrame(() => {
        const controls = get().controls as OrbitControlsImpl | null
        if (!controls) return
        const selectActive = useStrawMobileStore.getState().activeTool === 'select'
        controls.enabled = !selectActive
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
  const setActiveTool = useStrawMobileStore((s) => s.setActiveTool)
  const theme = useThemeStore((s) => s.theme)
  const sceneTheme = SCENE_THEME[theme]
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
      onPointerMissed={() => {
        if (consumeMarqueeClick()) return
        // Keep select mode after a gizmo move so further selections stay available.
        if (consumeGizmoClick()) return
        // Empty single-click leaves selection mode so orbit is uncontested.
        if (useStrawMobileStore.getState().activeTool === 'select') {
          setActiveTool('none')
          return
        }
        selectShape(null)
      }}
    >
      <color attach="background" args={[sceneTheme.background]} />
      <fog attach="fog" args={[sceneTheme.background, 45, 120]} />
      <ambientLight intensity={sceneTheme.ambient} />
      <hemisphereLight intensity={sceneTheme.hemisphere} groundColor={sceneTheme.ground} />
      <directionalLight
        position={[5, 9, 4]}
        intensity={sceneTheme.directional}
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
      <Grid
        position={[0, GRID_Y, 0]}
        args={[40, 40]}
        cellColor={sceneTheme.cell}
        sectionColor={sceneTheme.section}
        fadeDistance={90}
        infiniteGrid
      />
      {/* Physics no longer suspends — see vite.config.ts rapierSyncPhysicsPlugin. */}
      <PhysicsScene />
      <MarqueeSelectController />
      <CameraViewSync />
      <OrbitEnabledGuard />
    </Canvas>
  )
}
