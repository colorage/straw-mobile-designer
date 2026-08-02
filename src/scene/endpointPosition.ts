import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { ANCHOR_POSITION, getScaledVertex } from '../state/shapeSpace'
import { useStrawMobileStore } from '../state/store'
import type { EndpointRef, Shape } from '../state/types'

function readBodyPose(body: RapierRigidBody): {
  translation: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
} | null {
  try {
    // A non-null ref can still point at a Rapier body that was freed between
    // frames (HMR, remount); calling into WASM then throws "null pointer".
    const t = body.translation()
    const r = body.rotation()
    if (
      !Number.isFinite(t.x) ||
      !Number.isFinite(t.y) ||
      !Number.isFinite(t.z) ||
      !Number.isFinite(r.x) ||
      !Number.isFinite(r.y) ||
      !Number.isFinite(r.z) ||
      !Number.isFinite(r.w)
    ) {
      return null
    }
    return { translation: t, rotation: r }
  } catch {
    return null
  }
}

/**
 * World-space position of a connection endpoint. Prefers the live Rapier pose
 * when a body exists so threads track hanging pieces; falls back to the store
 * transform for anything not yet in the physics world.
 */
export function getEndpointWorldPosition(
  endpoint: EndpointRef,
  shapesById: Map<string, Shape>,
): THREE.Vector3 | null {
  if (endpoint.kind === 'anchor') {
    const body = getBodyRef('anchor').current
    if (body) {
      const pose = readBodyPose(body)
      if (pose) {
        return new THREE.Vector3(pose.translation.x, pose.translation.y, pose.translation.z)
      }
    }
    return new THREE.Vector3(...ANCHOR_POSITION)
  }

  const shape = shapesById.get(endpoint.shapeId)
  if (!shape) return null

  const [lx, ly, lz] = getScaledVertex(shape, endpoint.vertexIndex)
  const reelPosition = useStrawMobileStore.getState().reelPositions[endpoint.shapeId]
  const body = getBodyRef(endpoint.shapeId).current
  // Prefer live reel pose so the thread shortens in sync with the sliding mesh.
  if (reelPosition) {
    return new THREE.Vector3(lx, ly, lz)
      .applyQuaternion(new THREE.Quaternion(...shape.quaternion))
      .add(new THREE.Vector3(...reelPosition))
  }
  if (body) {
    const pose = readBodyPose(body)
    if (pose) {
      return new THREE.Vector3(lx, ly, lz)
        .applyQuaternion(
          new THREE.Quaternion(
            pose.rotation.x,
            pose.rotation.y,
            pose.rotation.z,
            pose.rotation.w,
          ),
        )
        .add(new THREE.Vector3(pose.translation.x, pose.translation.y, pose.translation.z))
    }
  }

  const rotation = new THREE.Quaternion(...shape.quaternion)
  return new THREE.Vector3(lx, ly, lz)
    .applyQuaternion(rotation)
    .add(new THREE.Vector3(...shape.position))
}
