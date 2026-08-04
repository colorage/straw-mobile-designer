import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import { getBodyRef } from '../physics/bodyRefRegistry'
import type { Vector3Tuple } from '../geometry/primitives'
import { BASE_STRAW_LENGTH, useStrawMobileStore } from '../state/store'
import type { EndpointRef, QuatTuple, Shape } from '../state/types'

const scratchQuat = new THREE.Quaternion()

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

export interface EndpointPoseContext {
  reelPositions: Record<string, Vector3Tuple>
  reelQuaternions: Record<string, QuatTuple>
}

/** Snapshot reel pose maps once per scan so callers avoid per-endpoint store reads. */
export function getEndpointPoseContext(): EndpointPoseContext {
  const state = useStrawMobileStore.getState()
  return {
    reelPositions: state.reelPositions,
    reelQuaternions: state.reelQuaternions,
  }
}

/**
 * Writes the world-space position of a connection endpoint into `target`.
 * Prefers the live Rapier pose when a body exists so threads track hanging
 * pieces; falls back to the store transform for anything not yet in the
 * physics world. Returns false when the endpoint has no resolvable shape.
 */
export function writeEndpointWorldPosition(
  endpoint: EndpointRef,
  shapesById: Map<string, Shape>,
  target: THREE.Vector3,
  poseContext?: EndpointPoseContext,
): boolean {
  if (endpoint.kind === 'anchor') {
    const body = getBodyRef('anchor').current
    if (body) {
      const pose = readBodyPose(body)
      if (pose) {
        target.set(pose.translation.x, pose.translation.y, pose.translation.z)
        return true
      }
    }
    target.set(0, useStrawMobileStore.getState().anchorY, 0)
    return true
  }

  const shape = shapesById.get(endpoint.shapeId)
  if (!shape) return false

  // Inline scaled vertex (avoids allocating a tuple per call on the scan hot path).
  const scale = shape.size * BASE_STRAW_LENGTH
  const local = shape.vertices[endpoint.vertexIndex]
  const lx = local[0] * scale
  const ly = local[1] * scale
  const lz = local[2] * scale

  const state = poseContext ?? useStrawMobileStore.getState()
  const reelPosition = state.reelPositions[endpoint.shapeId]
  const reelQuaternion = state.reelQuaternions[endpoint.shapeId]
  const body = getBodyRef(endpoint.shapeId).current

  // Prefer live reel pose so the thread shortens in sync with the sliding mesh.
  if (reelPosition) {
    const q = reelQuaternion ?? shape.quaternion
    scratchQuat.set(q[0], q[1], q[2], q[3])
    target.set(lx, ly, lz).applyQuaternion(scratchQuat)
    target.x += reelPosition[0]
    target.y += reelPosition[1]
    target.z += reelPosition[2]
    return true
  }
  if (body) {
    const pose = readBodyPose(body)
    if (pose) {
      scratchQuat.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w)
      target.set(lx, ly, lz).applyQuaternion(scratchQuat)
      target.x += pose.translation.x
      target.y += pose.translation.y
      target.z += pose.translation.z
      return true
    }
  }

  scratchQuat.set(
    shape.quaternion[0],
    shape.quaternion[1],
    shape.quaternion[2],
    shape.quaternion[3],
  )
  target.set(lx, ly, lz).applyQuaternion(scratchQuat)
  target.x += shape.position[0]
  target.y += shape.position[1]
  target.z += shape.position[2]
  return true
}

/**
 * World-space position of a connection endpoint. Prefers the live Rapier pose
 * when a body exists so threads track hanging pieces; falls back to the store
 * transform for anything not yet in the physics world.
 */
export function getEndpointWorldPosition(
  endpoint: EndpointRef,
  shapesById: Map<string, Shape>,
  poseContext?: EndpointPoseContext,
): THREE.Vector3 | null {
  const target = new THREE.Vector3()
  if (!writeEndpointWorldPosition(endpoint, shapesById, target, poseContext)) return null
  return target
}
