import * as THREE from 'three'
import { DEFAULT_ORBIT_TARGET } from './cameraDefaults'

interface CameraView {
  camera: THREE.Camera | null
  target: THREE.Vector3
}

const cameraView: CameraView = {
  camera: null,
  target: new THREE.Vector3(...DEFAULT_ORBIT_TARGET),
}

/** Keep the latest camera + orbit look-at available to non-R3F code (e.g. placement). */
export function setCameraView(camera: THREE.Camera, target?: THREE.Vector3Like) {
  cameraView.camera = camera
  if (target) {
    cameraView.target.set(target.x, target.y, target.z)
  }
}

export function getCameraView(): { camera: THREE.Camera | null; target: THREE.Vector3 } {
  return cameraView
}
