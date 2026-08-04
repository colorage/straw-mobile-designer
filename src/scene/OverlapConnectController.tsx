import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { getHangingShapeIds } from '../physics/restingLayout'
import { useStrawMobileStore } from '../state/store'
import { endpointBodyKey, endpointsEqual } from '../state/types'
import {
  findClosestOverlappingPair,
  OVERLAP_DWELL_MS,
  OVERLAP_RADIUS,
  OVERLAP_SCAN_IDLE_MS,
  OVERLAP_SETTLE_SPEED,
  overlapPairKey,
} from './cornerProximity'

/** Proximity scans are far cheaper than 60 Hz; dwell is 1s so ~15 Hz is plenty. */
const SCAN_INTERVAL_S = 1 / 15

function bodySpeed(bodyKey: string): number {
  if (bodyKey === 'anchor') return 0
  const body = getBodyRef(bodyKey).current
  if (!body) return 0
  try {
    const v = body.linvel()
    const w = body.angvel()
    return Math.max(Math.hypot(v.x, v.y, v.z), Math.hypot(w.x, w.y, w.z))
  } catch {
    return 0
  }
}

/**
 * Hanging dynamic bodies must be nearly still (and nearly still relative to
 * each other) before dwell accumulates — brief sway fly-bys should not suggest.
 * Free/kinematic pieces always count as settled.
 */
function pairIsSettled(
  bodyA: string,
  bodyB: string,
  hangingIds: Set<string>,
): boolean {
  const aHanging = bodyA !== 'anchor' && hangingIds.has(bodyA)
  const bHanging = bodyB !== 'anchor' && hangingIds.has(bodyB)
  if (!aHanging && !bHanging) return true

  const speedA = aHanging ? bodySpeed(bodyA) : 0
  const speedB = bHanging ? bodySpeed(bodyB) : 0
  if (speedA > OVERLAP_SETTLE_SPEED || speedB > OVERLAP_SETTLE_SPEED) return false

  // Relative linvel when both hang — keeps a mutual swing from counting as dwell.
  if (aHanging && bHanging) {
    const bodyRefA = getBodyRef(bodyA).current
    const bodyRefB = getBodyRef(bodyB).current
    if (bodyRefA && bodyRefB) {
      try {
        const va = bodyRefA.linvel()
        const vb = bodyRefB.linvel()
        const rel = Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z)
        if (rel > OVERLAP_SETTLE_SPEED) return false
      } catch {
        return false
      }
    }
  }

  return true
}

/**
 * Watches free and hanging corners (+ the ceiling hook). When the closest
 * overlapping pair stays within range for OVERLAP_DWELL_MS, auto-ties a thread.
 *
 * Runs at default useFrame priority (0), same as ReelInController — do not pass
 * a positive priority or R3F will skip automatic rendering.
 *
 * Scans are throttled to SCAN_INTERVAL_S; the pairwise search itself is also
 * spatially hashed (see findClosestOverlappingPair). After OVERLAP_SCAN_IDLE_MS
 * of consecutive no-pair scans the scanner sleeps until a scene action bumps
 * overlapScanWakeToken (or a reel-in starts).
 */
export function OverlapConnectController() {
  const dwellKeyRef = useRef<string | null>(null)
  const dwellStartedAtRef = useRef<number>(0)
  const scanAccumulatorRef = useRef(0)
  const asleepRef = useRef(false)
  const idleMsRef = useRef(0)
  const lastWakeTokenRef = useRef(-1)

  useFrame((_, delta) => {
    const {
      shapes,
      connections,
      activeTool,
      reelIns,
      overlapSuggest,
      overlapScanWakeToken,
      setOverlapSuggest,
      connectEndpoints,
    } = useStrawMobileStore.getState()

    const clearDwell = () => {
      if (dwellKeyRef.current !== null || overlapSuggest) {
        dwellKeyRef.current = null
        setOverlapSuggest(null)
      }
    }

    // Cheap mode gates run every frame so scissors/empty clear suggest immediately.
    if (activeTool === 'scissors' || shapes.length === 0) {
      scanAccumulatorRef.current = 0
      idleMsRef.current = 0
      asleepRef.current = false
      clearDwell()
      return
    }

    // Scene-changing actions bump the wake token; resume scanning immediately.
    if (overlapScanWakeToken !== lastWakeTokenRef.current) {
      lastWakeTokenRef.current = overlapScanWakeToken
      asleepRef.current = false
      idleMsRef.current = 0
      scanAccumulatorRef.current = SCAN_INTERVAL_S
    }

    // Stay awake while a reel-in is animating — corners may meet as it finishes.
    if (reelIns.length > 0 && asleepRef.current) {
      asleepRef.current = false
      idleMsRef.current = 0
    }

    if (asleepRef.current) return

    scanAccumulatorRef.current += delta
    if (scanAccumulatorRef.current < SCAN_INTERVAL_S) return
    // Keep residual so hitchy frames don't permanently desync the cadence.
    scanAccumulatorRef.current %= SCAN_INTERVAL_S

    const hangingIds = getHangingShapeIds(connections)
    const reelingIds = new Set(reelIns.map((reel) => reel.shapeId))
    const pair = findClosestOverlappingPair(shapes, connections, OVERLAP_RADIUS)

    if (!pair) {
      clearDwell()
      // Don't idle-sleep mid reel-in — wait until the scene settles.
      if (reelIns.length === 0) {
        idleMsRef.current += SCAN_INTERVAL_S * 1000
        if (idleMsRef.current >= OVERLAP_SCAN_IDLE_MS) {
          asleepRef.current = true
          idleMsRef.current = 0
          scanAccumulatorRef.current = 0
        }
      } else {
        idleMsRef.current = 0
      }
      return
    }

    // A finding resets the idle timer so dwell/connect can finish.
    idleMsRef.current = 0

    // Skip while either end is mid reel-in (poses are animating).
    const bodyA = endpointBodyKey(pair.a)
    const bodyB = endpointBodyKey(pair.b)
    if (reelingIds.has(bodyA) || reelingIds.has(bodyB)) {
      clearDwell()
      return
    }

    if (!pairIsSettled(bodyA, bodyB, hangingIds)) {
      clearDwell()
      return
    }

    const key = overlapPairKey(pair.a, pair.b)
    const now = performance.now()

    if (dwellKeyRef.current !== key) {
      dwellKeyRef.current = key
      dwellStartedAtRef.current = now
      setOverlapSuggest({ a: pair.a, b: pair.b, startedAt: now })
      return
    }

    // Keep store endpoints in sync if the closest pair identity is stable but
    // a/b order flipped; skip writes when the same unordered pair is already shown.
    const samePair =
      !!overlapSuggest &&
      ((endpointsEqual(overlapSuggest.a, pair.a) && endpointsEqual(overlapSuggest.b, pair.b)) ||
        (endpointsEqual(overlapSuggest.a, pair.b) && endpointsEqual(overlapSuggest.b, pair.a)))
    if (!samePair) {
      setOverlapSuggest({ a: pair.a, b: pair.b, startedAt: dwellStartedAtRef.current })
    }

    if (now - dwellStartedAtRef.current >= OVERLAP_DWELL_MS) {
      dwellKeyRef.current = null
      connectEndpoints(pair.a, pair.b)
    }
  })

  return null
}
