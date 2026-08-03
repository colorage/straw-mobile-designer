import { useFrame } from '@react-three/fiber'
import { useStrawMobileStore } from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { getHangingShapeIds } from './restingLayout'
import { reelInBodyKeys } from './reelIn'

/** Soft cap on hanging linear speed (m/s) — above this, scale down excess. */
const MAX_LIN_SPEED = 2.5
/** Soft cap on hanging angular speed (rad/s). */
const MAX_ANG_SPEED = 6

function clampVecSpeed(
  v: { x: number; y: number; z: number },
  maxSpeed: number,
): { x: number; y: number; z: number } | null {
  const speed = Math.hypot(v.x, v.y, v.z)
  if (speed <= maxSpeed || speed < 1e-8) return null
  const scale = maxSpeed / speed
  return { x: v.x * scale, y: v.y * scale, z: v.z * scale }
}

/**
 * After each physics step, soft-clamp hanging body velocities so rare solver
 * spikes cannot snowball through a multi-link spherical-joint chain.
 * Excess is scaled down to the cap — never zeroed — so natural sway remains.
 */
export function HangingEnergyLimiter() {
  useFrame(() => {
    const { connections, reelIns } = useStrawMobileStore.getState()
    const reelingIds = reelInBodyKeys(reelIns ?? [])
    for (const id of getHangingShapeIds(connections)) {
      if (reelingIds.has(id)) continue
      const body = getBodyRef(id).current
      if (!body) continue
      try {
        const lin = clampVecSpeed(body.linvel(), MAX_LIN_SPEED)
        if (lin) body.setLinvel(lin, true)
        const ang = clampVecSpeed(body.angvel(), MAX_ANG_SPEED)
        if (ang) body.setAngvel(ang, true)
      } catch {
        // Body may have been freed between frames.
      }
    }
  }, 1)

  return null
}
