import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { getScaledVertex } from '../state/shapeSpace'
import type { QuatTuple, Shape } from '../state/types'

export type MutablePose = {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

export function quatTuple(q: THREE.Quaternion): QuatTuple {
  return [q.x, q.y, q.z, q.w]
}

export function poseFromShape(shape: Shape): MutablePose {
  return {
    position: new THREE.Vector3(...shape.position),
    quaternion: new THREE.Quaternion(...shape.quaternion),
  }
}

export function localVertex(shape: Shape, vertexIndex: number): THREE.Vector3 {
  return new THREE.Vector3(...getScaledVertex(shape, vertexIndex))
}

export function worldVertexFromPose(
  pose: MutablePose,
  shape: Shape,
  vertexIndex: number,
): THREE.Vector3 {
  return localVertex(shape, vertexIndex).applyQuaternion(pose.quaternion).add(pose.position)
}

/** Shortest rotation that takes `from` onto `to` (both treated as directions). */
export function quaternionAligning(from: THREE.Vector3, to: THREE.Vector3): THREE.Quaternion {
  const a = from.clone()
  const b = to.clone()
  if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) {
    return new THREE.Quaternion()
  }
  a.normalize()
  b.normalize()
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1)
  if (dot > 0.999999) return new THREE.Quaternion()
  if (dot < -0.999999) {
    const axis = new THREE.Vector3(1, 0, 0).cross(a)
    if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0).cross(a)
    axis.normalize()
    return new THREE.Quaternion().setFromAxisAngle(axis, Math.PI)
  }
  const axis = new THREE.Vector3().crossVectors(a, b).normalize()
  return new THREE.Quaternion().setFromAxisAngle(axis, Math.acos(dot))
}

/**
 * Rotate `quaternion` so `localAttachment` leans toward `desiredWorldDir`.
 * `amount` in [0,1] blends the full aligning rotation.
 */
export function rotateAttachmentToward(
  quaternion: THREE.Quaternion,
  localAttachment: THREE.Vector3,
  desiredWorldDir: THREE.Vector3,
  amount: number,
): void {
  if (amount <= 0) return
  if (localAttachment.lengthSq() < 1e-12 || desiredWorldDir.lengthSq() < 1e-12) return

  const currentDir = localAttachment.clone().applyQuaternion(quaternion)
  const delta = quaternionAligning(currentDir, desiredWorldDir)
  if (amount < 1) {
    delta.slerp(new THREE.Quaternion(), 1 - amount)
  }
  quaternion.premultiply(delta).normalize()
}

/** Quaternion that hangs a shape from `vertexIndex` with that corner pointing along `upWorld`. */
export function hangQuaternionForVertex(
  shape: Shape,
  vertexIndex: number,
  upWorld: THREE.Vector3,
): THREE.Quaternion {
  const local = localVertex(shape, vertexIndex)
  if (local.lengthSq() < 1e-12 || upWorld.lengthSq() < 1e-12) {
    return new THREE.Quaternion(...shape.quaternion)
  }
  const q = new THREE.Quaternion(...shape.quaternion)
  const delta = quaternionAligning(local.clone().applyQuaternion(q), upWorld)
  return delta.multiply(q).normalize()
}

export function toVector3Tuple(v: THREE.Vector3): Vector3Tuple {
  return [v.x, v.y, v.z]
}
