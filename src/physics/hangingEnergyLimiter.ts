import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { useStrawMobileStore } from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { getHangingShapeIds } from './restingLayout'
import { reelInBodyKeys } from './reelIn'

/** Soft cap on hanging linear speed (m/s) — above this, scale down excess. */
const MAX_LIN_SPEED = 2.5
/** Soft cap on hanging angular speed (rad/s). */
const MAX_ANG_SPEED = 6

/** Calm short-mobile damping (matches PhysicsShape dynamic defaults). */
const BASE_LIN_DAMP = 0.65
const BASE_ANG_DAMP = 0.8
/** Extra base damping once many pieces hang. */
const MANY_LIN_DAMP = 1.05
const MANY_ANG_DAMP = 1.25
/** Peak damping when a body is near the soft speed caps. */
const STRESS_LIN_DAMP = 1.45
const STRESS_ANG_DAMP = 1.8
/** Hanging count at which we raise the calm baseline. */
const MANY_HANGING = 4
/** Fraction of the soft caps where stress damping begins to blend in. */
const STRESS_START = 0.55
/** Ignore damping churn below this delta (avoids waking calm bodies). */
const DAMP_EPS = 1e-4

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
 * Raise damping with hanging count, then blend toward stress values as a body
 * approaches the soft speed caps. Short calm mobiles stay lively.
 */
export function adaptiveDamping(
  hangingCount: number,
  linSpeed: number,
  angSpeed: number,
): { linear: number; angular: number } {
  let linear = hangingCount >= MANY_HANGING ? MANY_LIN_DAMP : BASE_LIN_DAMP
  let angular = hangingCount >= MANY_HANGING ? MANY_ANG_DAMP : BASE_ANG_DAMP

  const stress = Math.max(linSpeed / MAX_LIN_SPEED, angSpeed / MAX_ANG_SPEED)
  if (stress > STRESS_START) {
    const t = Math.min(1, (stress - STRESS_START) / (1 - STRESS_START))
    linear += (STRESS_LIN_DAMP - linear) * t
    angular += (STRESS_ANG_DAMP - angular) * t
  }

  return { linear, angular }
}

/**
 * After each physics step: soft-clamp hanging velocities and adapt damping so
 * long chains / hubs shed energy without killing sway on short mobiles.
 *
 * Sleep-friendly: skips sleeping bodies, clamps without waking, and only
 * rewrites damping when the value actually changes.
 *
 * Runs at default useFrame priority (0), same as ReelInController. Physics
 * uses updatePriority={-1} so this still runs after the Rapier step. Do NOT
 * pass a positive priority — in R3F that disables automatic rendering unless
 * the subscriber calls gl.render() itself, which freezes the canvas.
 */
export function HangingEnergyLimiter() {
  const lastDampRef = useRef(new Map<string, { linear: number; angular: number }>())

  useFrame(() => {
    const { connections, reelIns } = useStrawMobileStore.getState()
    const reelingIds = reelInBodyKeys(reelIns ?? [])
    const hangingIds = getHangingShapeIds(connections)
    const hangingCount = hangingIds.size
    if (hangingCount === 0) {
      lastDampRef.current.clear()
      return
    }

    const lastDamp = lastDampRef.current
    // Drop cache entries for shapes that left the hanging chain.
    for (const id of lastDamp.keys()) {
      if (!hangingIds.has(id)) lastDamp.delete(id)
    }

    for (const id of hangingIds) {
      if (reelingIds.has(id)) continue
      const body = getBodyRef(id).current
      if (!body) continue
      try {
        // Sleeping islands need no clamp/damping churn — and reading/writing
        // would risk waking them (setLinvel(..., true) used to do exactly that).
        if (body.isSleeping()) continue

        const lin = clampVecSpeed(body.linvel(), MAX_LIN_SPEED)
        if (lin) body.setLinvel(lin, false)
        const ang = clampVecSpeed(body.angvel(), MAX_ANG_SPEED)
        if (ang) body.setAngvel(ang, false)

        const v = body.linvel()
        const w = body.angvel()
        const linSpeed = Math.hypot(v.x, v.y, v.z)
        const angSpeed = Math.hypot(w.x, w.y, w.z)
        const damp = adaptiveDamping(hangingCount, linSpeed, angSpeed)
        const prev = lastDamp.get(id)
        if (
          !prev ||
          Math.abs(prev.linear - damp.linear) > DAMP_EPS ||
          Math.abs(prev.angular - damp.angular) > DAMP_EPS
        ) {
          body.setLinearDamping(damp.linear)
          body.setAngularDamping(damp.angular)
          lastDamp.set(id, damp)
        }
      } catch {
        // Body may have been freed between frames.
      }
    }
  })

  return null
}
