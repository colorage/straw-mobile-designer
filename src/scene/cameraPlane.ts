import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'

const _ndc = new THREE.Vector2()
const _raycaster = new THREE.Raycaster()
const _plane = new THREE.Plane()
const _forward = new THREE.Vector3()
const _point = new THREE.Vector3()
const _hit = new THREE.Vector3()

/**
 * Project a browser pointer onto the camera-facing plane through `planePoint`.
 * Returns null when the ray is parallel to the plane or the canvas is invalid.
 * When `target` is omitted, a shared scratch vector is reused (copy before storing).
 */
export function pointerToCameraPlane(
  clientX: number,
  clientY: number,
  planePoint: THREE.Vector3 | Vector3Tuple,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  target: THREE.Vector3 = _hit,
): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  _ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
  _raycaster.setFromCamera(_ndc, camera)
  camera.getWorldDirection(_forward)

  if (planePoint instanceof THREE.Vector3) {
    _point.copy(planePoint)
  } else {
    _point.set(planePoint[0], planePoint[1], planePoint[2])
  }
  _plane.setFromNormalAndCoplanarPoint(_forward, _point)
  if (_raycaster.ray.intersectPlane(_plane, target) === null) return null
  return target
}
