import { useFrame } from '@react-three/fiber'
import type { Vector3Tuple } from '../geometry/primitives'
import {
  BASE_ANCHOR_Y,
  BASE_STRAW_LENGTH,
  useStrawMobileStore,
} from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { driveMesh } from './meshDriveRegistry'
import { getHangingShapeIds } from './restingLayout'

/** Lowest hanging extent must stay at or above this world Y. */
const CLEARANCE_Y = -2
/** Max units/sec the hook may rise or fall. */
const LIFT_SPEED = 4
const LIFT_EPS = 1e-5

/**
 * Raise the ceiling hook when the hanging chain would dip below clearance;
 * ease back toward the base height when slack returns. Camera is untouched.
 *
 * Target height is derived from hang depth relative to the hook
 * (`anchorY - minY`) so lifting does not ratchet upward while the chain
 * catches up through joints.
 *
 * Each lift step translates the hook and every hanging body by the same ΔY
 * so spherical joints keep their rest length — moving only the fixed hook
 * used to stretch the live chain and inject wobble into tall builds.
 *
 * Runs at default useFrame priority (0). Physics uses updatePriority={-1},
 * so this still runs after the Rapier step.
 */
export function AnchorLiftController() {
  useFrame((_, delta) => {
    const { connections, shapes, anchorY, setAnchorY, reelPositions } =
      useStrawMobileStore.getState()
    const hangingIds = getHangingShapeIds(connections)

    let targetY = BASE_ANCHOR_Y

    if (hangingIds.size > 0) {
      let minCenterY = Infinity
      let maxSize = 0
      const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))

      for (const id of hangingIds) {
        const shape = shapesById.get(id)
        if (shape && shape.size > maxSize) maxSize = shape.size

        const body = getBodyRef(id).current
        if (!body) {
          if (shape && shape.position[1] < minCenterY) minCenterY = shape.position[1]
          continue
        }
        try {
          const y = body.translation().y
          if (Number.isFinite(y) && y < minCenterY) minCenterY = y
        } catch {
          if (shape && shape.position[1] < minCenterY) minCenterY = shape.position[1]
        }
      }

      if (Number.isFinite(minCenterY)) {
        // Approximate bottom of the largest hanging piece from its center.
        const size = maxSize > 0 ? maxSize : 1
        const margin = BASE_STRAW_LENGTH * size * 0.75
        const minY = minCenterY - margin
        const hangDepth = anchorY - minY
        targetY = Math.max(BASE_ANCHOR_Y, CLEARANCE_Y + hangDepth)
      }
    }

    const dt = Math.min(delta, 0.05)
    const maxStep = LIFT_SPEED * dt
    const nextY =
      Math.abs(targetY - anchorY) <= maxStep
        ? targetY
        : anchorY + Math.sign(targetY - anchorY) * maxStep

    setAnchorY(nextY)

    const anchorBody = getBodyRef('anchor').current
    let currentY = anchorY
    if (anchorBody) {
      try {
        const t = anchorBody.translation()
        if (Number.isFinite(t.y)) currentY = t.y
      } catch {
        // Body may be freed during remount.
      }
    }

    const dy = nextY - currentY
    if (Math.abs(dy) < LIFT_EPS) return

    if (anchorBody) {
      try {
        anchorBody.setTranslation({ x: 0, y: nextY, z: 0 }, false)
      } catch {
        // Body may be freed during remount.
      }
    }

    let nextReelPositions: Record<string, Vector3Tuple> | null = null

    for (const id of hangingIds) {
      const body = getBodyRef(id).current
      if (body) {
        try {
          const t = body.translation()
          const position: Vector3Tuple = [t.x, t.y + dy, t.z]
          body.setTranslation({ x: position[0], y: position[1], z: position[2] }, false)
          // Sleeping visuals skip body reads for FPS — push the mesh so it tracks.
          driveMesh(id, position)
        } catch {
          // Body may have been freed between frames.
        }
      }

      const reelPos = reelPositions[id]
      if (reelPos) {
        if (!nextReelPositions) nextReelPositions = { ...reelPositions }
        nextReelPositions[id] = [reelPos[0], reelPos[1] + dy, reelPos[2]]
      }
    }

    if (nextReelPositions) {
      useStrawMobileStore.setState({ reelPositions: nextReelPositions })
    }
  })

  return null
}
