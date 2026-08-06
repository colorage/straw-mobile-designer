import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'

/** MIME type used when dragging a shape kind from the Add Shapes toolbar. */
export const SHAPE_DRAG_MIME = 'application/x-straw-shape'
/** Plain-text fallback MIME — some browsers drop custom types on drop. */
export const SHAPE_DRAG_TEXT_MIME = 'text/plain'

const WORKBENCH_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)

const _ndc = new THREE.Vector2()
const _raycaster = new THREE.Raycaster()
const _hit = new THREE.Vector3()
const _camPlane = new THREE.Plane()
const _forward = new THREE.Vector3()
const _lookAt = new THREE.Vector3(0, 2, 0)

const THUMBNAIL_MAX_WIDTH = 320
const THUMBNAIL_JPEG_QUALITY = 0.72

let camera: THREE.Camera | null = null
let canvasElement: HTMLCanvasElement | null = null
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null

/** Keep the latest R3F camera + canvas so DOM drop handlers can raycast. */
export function setCanvasBridge(
  nextCamera: THREE.Camera,
  canvas: HTMLCanvasElement,
  nextRenderer?: THREE.WebGLRenderer,
  nextScene?: THREE.Scene,
) {
  camera = nextCamera
  canvasElement = canvas
  if (nextRenderer) renderer = nextRenderer
  if (nextScene) scene = nextScene
}

/** Live camera from the canvas bridge (null before the canvas mounts). */
export function getBridgeCamera(): THREE.Camera | null {
  return camera
}

/** Live canvas element from the bridge (null before mount). */
export function getBridgeCanvas(): HTMLCanvasElement | null {
  return canvasElement
}

/**
 * Project a browser client coordinate onto a placement plane.
 * Prefers the workbench plane (z = 0); if the view is edge-on to that plane,
 * falls back to a camera-facing plane through the orbit look-at origin.
 */
export function screenToWorkbenchPlane(clientX: number, clientY: number): Vector3Tuple | null {
  if (!camera || !canvasElement) return null

  const rect = canvasElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1

  _raycaster.setFromCamera(_ndc, camera)
  const hit = _raycaster.ray.intersectPlane(WORKBENCH_PLANE, _hit)
  if (hit) {
    return [hit.x, hit.y, hit.z]
  }

  // Edge-on to z=0: place on a camera-facing plane through the default look-at.
  camera.getWorldDirection(_forward)
  _camPlane.setFromNormalAndCoplanarPoint(_forward, _lookAt)
  const camHit = _raycaster.ray.intersectPlane(_camPlane, _hit)
  if (!camHit) return null
  return [camHit.x, camHit.y, camHit.z]
}

/**
 * Capture the current 3D view as a small JPEG data URL for gallery thumbnails.
 * Returns null when the canvas bridge is not ready yet.
 */
export function captureCanvasThumbnail(): string | null {
  if (!renderer || !scene || !camera || !canvasElement) return null

  renderer.render(scene, camera)

  const source = canvasElement
  const sourceWidth = source.width
  const sourceHeight = source.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return null

  const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / sourceWidth)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))

  const offscreen = document.createElement('canvas')
  offscreen.width = width
  offscreen.height = height
  const ctx = offscreen.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(source, 0, 0, width, height)
  return offscreen.toDataURL('image/jpeg', THUMBNAIL_JPEG_QUALITY)
}
