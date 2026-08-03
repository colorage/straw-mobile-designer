import type * as THREE from 'three'
import { getEndpointWorldPosition } from '../scene/endpointPosition'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { useStrawMobileStore } from '../state/store'

/**
 * Dev-only helper exposing internals on `window` so automated/manual testing
 * can precisely locate 3D handles and inspect physics state. Tree-shaken out
 * of production builds since `import.meta.env.DEV` is statically false there.
 */
export function exposeDebugGlobals(
  camera: THREE.Camera,
  size: { width: number; height: number },
  extras?: { scene?: THREE.Scene; gl?: THREE.WebGLRenderer; controls?: unknown },
) {
  if (!import.meta.env.DEV) return
  ;(window as unknown as Record<string, unknown>).__strawDebug = {
    store: useStrawMobileStore,
    camera,
    size,
    scene: extras?.scene ?? null,
    gl: extras?.gl ?? null,
    controls: extras?.controls ?? null,
    getEndpointWorldPosition,
    getBodyRef,
  }
}
