import { useFrame } from '@react-three/fiber'
import type { Vector3Tuple } from '../geometry/primitives'
import { useStrawMobileStore } from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { driveMesh } from './meshDriveRegistry'
import { easeOutCubic } from './reelIn'

/**
 * Drives in-progress thread reel-ins.
 *
 * Each interpolated pose is written into the kinematic body and into transient
 * `reelPositions` (RigidBody prop + DrivenShapeVisual). `driveMesh` pushes the
 * same pose to the plain visual group so the shorten is visible the same frame.
 * Persisted `shapes` only commit when the reel finishes.
 */
export function ReelInController() {
  // Priority 1: run after rapier's mesh←body sync so our visual write wins the frame.
  useFrame(() => {
    const { reelIns, finishReelIns, setReelPositions } = useStrawMobileStore.getState()
    const active = reelIns ?? []
    if (active.length === 0) return

    const now = performance.now()
    const completed: { shapeId: string; position: Vector3Tuple }[] = []
    const framePositions: Record<string, Vector3Tuple> = {}

    for (const reel of active) {
      const duration = Math.max(reel.durationMs, 1)
      const t = Math.min(1, (now - reel.startedAt) / duration)
      const e = easeOutCubic(t)
      const position: Vector3Tuple = [
        reel.from[0] + (reel.to[0] - reel.from[0]) * e,
        reel.from[1] + (reel.to[1] - reel.from[1]) * e,
        reel.from[2] + (reel.to[2] - reel.from[2]) * e,
      ]

      framePositions[reel.shapeId] = position

      const body = getBodyRef(reel.shapeId).current
      if (body) {
        try {
          body.wakeUp()
          body.setNextKinematicTranslation({
            x: position[0],
            y: position[1],
            z: position[2],
          })
          body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true)
        } catch {
          // Body may have been removed mid-animation.
        }
      }

      // Imperative mesh write after physics sync so the shorten is visible.
      driveMesh(reel.shapeId, position)

      if (t >= 1) {
        completed.push({ shapeId: reel.shapeId, position: reel.to })
      }
    }

    setReelPositions(framePositions)
    if (completed.length > 0) finishReelIns(completed)
  }, 1)

  return null
}
