import { useFrame } from '@react-three/fiber'
import { useStrawMobileStore } from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { getHangingShapeIds } from './restingLayout'
import { reelInBodyKeys } from './reelIn'

/** Base horizontal acceleration from a calm breeze (m/s²). */
const BASE_ACCEL = 0.35
/** Extra acceleration at peak gust (m/s²). */
const GUST_ACCEL = 0.45
/** Slow yaw wobble so the breeze is not a dead +X push (rad/s). */
const YAW_RATE = 0.35
/** Primary gust frequency (rad/s). */
const GUST_RATE = 1.1
/** Secondary gust frequency for irregularity (rad/s). */
const GUST2_RATE = 2.3
/** Cap dt so a hitch cannot dump a huge impulse. */
const MAX_DT = 1 / 20

/**
 * When wind is enabled: apply a mild, gusty horizontal impulse to hanging
 * bodies so mobiles sway. Free (kinematic) workbench pieces are untouched.
 *
 * Runs at default useFrame priority (0). Physics uses updatePriority={-1},
 * so impulses land for the next Rapier step — same pattern as GrabController.
 */
export function WindController() {
  useFrame((state, delta) => {
    const { windEnabled, connections, reelIns } = useStrawMobileStore.getState()
    if (!windEnabled) return

    const hangingIds = getHangingShapeIds(connections)
    if (hangingIds.size === 0) return

    const reelingIds = reelInBodyKeys(reelIns ?? [])
    const t = state.clock.elapsedTime
    const dt = Math.min(Math.max(delta, 0), MAX_DT)

    // Direction mostly +X with a slow horizontal yaw wobble.
    const yaw = Math.sin(t * YAW_RATE) * 0.55
    const dirX = Math.cos(yaw)
    const dirZ = Math.sin(yaw)

    // Gust envelope in [0, 1]: calm base + irregular peaks.
    const gust =
      0.55 +
      0.3 * Math.sin(t * GUST_RATE) +
      0.15 * Math.sin(t * GUST2_RATE + 1.7)
    const accel = BASE_ACCEL + GUST_ACCEL * Math.max(0, Math.min(1, gust))

    for (const id of hangingIds) {
      if (reelingIds.has(id)) continue
      const body = getBodyRef(id).current
      if (!body) continue
      try {
        // Only push dynamic hangers — kinematic free pieces / reeling stays put.
        if (!body.isDynamic()) continue

        const mass = body.mass()
        if (mass < 1e-4) continue

        const impulseScale = mass * accel * dt
        body.wakeUp()
        body.applyImpulse(
          {
            x: dirX * impulseScale,
            y: 0,
            z: dirZ * impulseScale,
          },
          true,
        )
      } catch {
        // Body may have been freed between frames.
      }
    }
  })

  return null
}
