import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'

/** MIME type used when dragging a shape kind from the Add Shapes toolbar. */
export const SHAPE_DRAG_MIME = 'application/x-straw-shape'

const WORKBENCH_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const _ndc = new THREE.Vector2()
const _raycaster = new THREE.Raycaster()
const _hit = new THREE.Vector3()

let camera: THREE.Camera | null = null
let canvasElement: HTMLCanvasElement | null = null

/** Keep the latest R3F camera + canvas so DOM drop handlers can raycast. */
export function setCanvasBridge(nextCamera: THREE.Camera, canvas: HTMLCanvasElement) {
  camera = nextCamera
  canvasElement = canvas
}

/**
 * Project a browser client coordinate onto the workbench plane (z = 0).
 * Returns null if the canvas bridge isn't ready or the ray misses the plane.
 */
export function screenToWorkbenchPlane(clientX: number, clientY: number): Vector3Tuple | null {
  if (!camera || !canvasElement) return null

  const rect = canvasElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1

  _raycaster.setFromCamera(_ndc, camera)
  const hit = _raycaster.ray.intersectPlane(WORKBENCH_PLANE, _hit)
  if (!hit) return null

  return [hit.x, hit.y, hit.z]
}
