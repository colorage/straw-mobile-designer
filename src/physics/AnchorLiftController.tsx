import { useFrame } from '@react-three/fiber'
import {
  BASE_ANCHOR_Y,
  BASE_STRAW_LENGTH,
  useStrawMobileStore,
} from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { getHangingShapeIds } from './restingLayout'

/** Lowest hanging extent must stay at or above this world Y. */
const CLEARANCE_Y = -2
/** Max units/sec the hook may rise or fall. */
const LIFT_SPEED = 4

/**
 * Raise the ceiling hook when the hanging chain would dip below clearance;
 * ease back toward the base height when slack returns. Camera is untouched.
 *
 * Target height is derived from hang depth relative to the hook
 * (`anchorY - minY`) so lifting does not ratchet upward while the chain
 * catches up through joints.
 *
 * Runs at default useFrame priority (0). Physics uses updatePriority={-1},
 * so this still runs after the Rapier step.
 */
export function AnchorLiftController() {
  useFrame((_, delta) => {
    const { connections, shapes, anchorY, setAnchorY } = useStrawMobileStore.getState()
    const hangingIds = getHangingShapeIds(connections)

    let targetY = BASE_ANCHOR_Y

    if (hangingIds.size > 0) {
      let minCenterY = Infinity
      let maxSize = 1
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
        const margin = BASE_STRAW_LENGTH * maxSize * 0.75
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

    const body = getBodyRef('anchor').current
    if (!body) return
    try {
      const t = body.translation()
      if (Math.abs(t.y - nextY) > 1e-5) {
        body.setTranslation({ x: 0, y: nextY, z: 0 }, true)
      }
    } catch {
      // Body may be freed during remount.
    }
  })

  return null
}
