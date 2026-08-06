import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { useStrawMobileStore } from '../state/store'
import {
  DEFAULT_ORBIT_OFFSET,
  DEFAULT_ORBIT_TARGET,
} from './cameraDefaults'
import { shapeWorldAabb } from './placement'

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
const _lookAt = new THREE.Vector3(...DEFAULT_ORBIT_TARGET)
const _savedPosition = new THREE.Vector3()
const _savedQuaternion = new THREE.Quaternion()
const _center = new THREE.Vector3()
const _orbitDir = new THREE.Vector3()
const _corner = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _viewForward = new THREE.Vector3()
const _worldUp = new THREE.Vector3(0, 1, 0)

const THUMBNAIL_MAX_WIDTH = 320
const THUMBNAIL_JPEG_QUALITY = 0.72
/** Extra margin so the construction fills the frame without clipping edges. */
const THUMBNAIL_FIT_PADDING = 1.35
const THUMBNAIL_MIN_DISTANCE = 2

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
 * Union AABB of all shapes in world space (live physics poses when available).
 * Returns null when there are no shapes.
 */
function constructionWorldAabb(): { min: THREE.Vector3; max: THREE.Vector3 } | null {
  const shapes = useStrawMobileStore.getState().shapes
  if (shapes.length === 0) return null

  const first = shapeWorldAabb(shapes[0], true)
  const min = first.min.clone()
  const max = first.max.clone()
  for (let i = 1; i < shapes.length; i++) {
    const aabb = shapeWorldAabb(shapes[i], true)
    min.min(aabb.min)
    max.max(aabb.max)
  }
  return { min, max }
}

/**
 * Distance along the default orbit direction so the AABB fits fully in the
 * perspective frustum (aspect-aware), with padding so edges are not clipped.
 */
function fitDistanceForAabb(
  cam: THREE.PerspectiveCamera,
  min: THREE.Vector3,
  max: THREE.Vector3,
  center: THREE.Vector3,
  orbitDir: THREE.Vector3,
): number {
  const vFov = THREE.MathUtils.degToRad(cam.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect)
  const halfV = Math.tan(vFov / 2)
  const halfH = Math.tan(hFov / 2)

  // Camera looks from (center + orbitDir * d) toward center → view forward = -orbitDir.
  _viewForward.copy(orbitDir).negate()
  _right.crossVectors(_viewForward, _worldUp)
  if (_right.lengthSq() < 1e-8) {
    _right.set(1, 0, 0)
  } else {
    _right.normalize()
  }
  _up.crossVectors(_right, _viewForward).normalize()

  let maxDist = THUMBNAIL_MIN_DISTANCE
  for (let xi = 0; xi < 2; xi++) {
    for (let yi = 0; yi < 2; yi++) {
      for (let zi = 0; zi < 2; zi++) {
        _corner.set(
          xi === 0 ? min.x : max.x,
          yi === 0 ? min.y : max.y,
          zi === 0 ? min.z : max.z,
        )
        _corner.sub(center)
        const x = Math.abs(_corner.dot(_right))
        const y = Math.abs(_corner.dot(_up))
        const zAlongView = _corner.dot(_viewForward)
        // Camera at center - forward*d; depth of corner = d + zAlongView.
        // Need |x| <= halfH * depth ⇒ d >= |x|/halfH - zAlongView.
        const distForX = halfH > 0 ? x / halfH - zAlongView : THUMBNAIL_MIN_DISTANCE
        const distForY = halfV > 0 ? y / halfV - zAlongView : THUMBNAIL_MIN_DISTANCE
        maxDist = Math.max(maxDist, distForX, distForY)
      }
    }
  }

  return maxDist * THUMBNAIL_FIT_PADDING
}

/**
 * Temporarily frame the camera on the construction with the default orbit angle,
 * then restore the live view so editing is unaffected.
 */
function frameCameraForThumbnail(cam: THREE.Camera): () => void {
  _savedPosition.copy(cam.position)
  _savedQuaternion.copy(cam.quaternion)

  const aabb = constructionWorldAabb()
  if (aabb) {
    _center.addVectors(aabb.min, aabb.max).multiplyScalar(0.5)
  } else {
    _center.set(...DEFAULT_ORBIT_TARGET)
  }

  _orbitDir.set(...DEFAULT_ORBIT_OFFSET)
  const orbitLen = _orbitDir.length()
  if (orbitLen > 1e-8) {
    _orbitDir.multiplyScalar(1 / orbitLen)
  } else {
    _orbitDir.set(0, 0, 1)
  }

  let distance = orbitLen
  if (aabb && cam instanceof THREE.PerspectiveCamera) {
    distance = fitDistanceForAabb(cam, aabb.min, aabb.max, _center, _orbitDir)
  }

  cam.position.copy(_center).addScaledVector(_orbitDir, distance)
  cam.lookAt(_center)
  cam.updateMatrixWorld(true)

  return () => {
    cam.position.copy(_savedPosition)
    cam.quaternion.copy(_savedQuaternion)
    cam.updateMatrixWorld(true)
  }
}

/**
 * Capture a framed JPEG data URL of the construction for gallery thumbnails.
 * Uses the default orbit angle and fits the full AABB; restores the live camera after.
 * Returns null when the canvas bridge is not ready yet.
 */
export function captureCanvasThumbnail(): string | null {
  if (!renderer || !scene || !camera || !canvasElement) return null

  const restore = frameCameraForThumbnail(camera)
  try {
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
  } finally {
    restore()
  }
}
