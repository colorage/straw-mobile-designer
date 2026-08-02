import { useFrame } from '@react-three/fiber'
import type { Vector3Tuple } from '../geometry/primitives'
import { useStrawMobileStore } from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { easeOutCubic } from './reelIn'

/**
 * Drives in-progress thread reel-ins: lerps kinematic bodies from their workbench
 * pose toward the tied corner each frame, then commits the final pose and drops
 * the reel-in so joints / gravity can take over.
 *
 * Reads reel-ins from the store each frame (not a render closure) so a just-started
 * animation is never missed, and only writes back when a reel completes — keeping
 * React/localStorage quiet while the thread shortens.
 */
export function ReelInController() {
  useFrame(() => {
    const { reelIns, finishReelIns } = useStrawMobileStore.getState()
    const active = reelIns ?? []
    if (active.length === 0) return

    const now = performance.now()
    const completed: { shapeId: string; position: Vector3Tuple }[] = []

    for (const reel of active) {
      const duration = Math.max(reel.durationMs, 1)
      const t = Math.min(1, (now - reel.startedAt) / duration)
      const e = easeOutCubic(t)
      const x = reel.from[0] + (reel.to[0] - reel.from[0]) * e
      const y = reel.from[1] + (reel.to[1] - reel.from[1]) * e
      const z = reel.from[2] + (reel.to[2] - reel.from[2]) * e

      const body = getBodyRef(reel.shapeId).current
      if (body) {
        try {
          body.setNextKinematicTranslation({ x, y, z })
          body.setTranslation({ x, y, z }, true)
        } catch {
          // Body may have been removed mid-animation.
        }
      }

      if (t >= 1) {
        completed.push({
          shapeId: reel.shapeId,
          position: [reel.to[0], reel.to[1], reel.to[2]],
        })
      }
    }

    if (completed.length > 0) finishReelIns(completed)
  })

  return null
}
