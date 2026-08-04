import {
  beginPhysicsTransformSync,
  endPhysicsTransformSync,
} from '../gallery/physicsSyncGate'
import type { Vector3Tuple } from '../geometry/primitives'
import { useStrawMobileStore } from '../state/store'
import type { QuatTuple } from '../state/types'
import { getBodyRef } from './bodyRefRegistry'

/** Treat poses as equal below this delta so free/static shapes don't rewrite the store. */
const POSE_EPS = 1e-5

function poseUnchanged(
  position: Vector3Tuple,
  quaternion: QuatTuple,
  nextPosition: Vector3Tuple,
  nextQuaternion: QuatTuple,
): boolean {
  return (
    Math.abs(position[0] - nextPosition[0]) < POSE_EPS &&
    Math.abs(position[1] - nextPosition[1]) < POSE_EPS &&
    Math.abs(position[2] - nextPosition[2]) < POSE_EPS &&
    Math.abs(quaternion[0] - nextQuaternion[0]) < POSE_EPS &&
    Math.abs(quaternion[1] - nextQuaternion[1]) < POSE_EPS &&
    Math.abs(quaternion[2] - nextQuaternion[2]) < POSE_EPS &&
    Math.abs(quaternion[3] - nextQuaternion[3]) < POSE_EPS
  )
}

/**
 * Reads live Rapier poses into the store for the given shape ids (or every shape).
 *
 * Batches into one store write, skips unchanged poses, and marks the write as a
 * physics sync so gallery auto-persist does not re-arm itself.
 */
export function syncShapeTransformsFromPhysics(shapeIds?: Iterable<string>) {
  const { shapes } = useStrawMobileStore.getState()
  const ids = shapeIds ? new Set(shapeIds) : null

  const updates = new Map<string, { position: Vector3Tuple; quaternion: QuatTuple }>()

  for (const shape of shapes) {
    if (ids && !ids.has(shape.id)) continue
    const body = getBodyRef(shape.id).current
    if (!body) continue
    try {
      const t = body.translation()
      const r = body.rotation()
      const position: Vector3Tuple = [t.x, t.y, t.z]
      const quaternion: QuatTuple = [r.x, r.y, r.z, r.w]
      if (poseUnchanged(shape.position, shape.quaternion, position, quaternion)) continue
      updates.set(shape.id, { position, quaternion })
    } catch {
      // Body may have been freed between frames.
    }
  }

  if (updates.size === 0) return

  beginPhysicsTransformSync()
  try {
    useStrawMobileStore.setState((state) => ({
      shapes: state.shapes.map((shape) => {
        const next = updates.get(shape.id)
        return next
          ? { ...shape, position: next.position, quaternion: next.quaternion }
          : shape
      }),
    }))
  } finally {
    endPhysicsTransformSync()
  }
}
