import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { useStrawMobileStore } from '../state/store'
import { endpointBodyKey, endpointsEqual } from '../state/types'
import { getHangingShapeIds } from '../physics/restingLayout'
import {
  findClosestOverlappingPair,
  OVERLAP_DWELL_MS,
  OVERLAP_RADIUS,
  overlapPairKey,
} from './cornerProximity'

/**
 * Watches free corners (+ the ceiling hook). When the closest overlapping pair
 * stays within range for OVERLAP_DWELL_MS, auto-ties a thread via connectEndpoints.
 *
 * Runs at default useFrame priority (0), same as ReelInController — do not pass
 * a positive priority or R3F will skip automatic rendering.
 */
export function OverlapConnectController() {
  const dwellKeyRef = useRef<string | null>(null)
  const dwellStartedAtRef = useRef<number>(0)

  useFrame(() => {
    const {
      shapes,
      connections,
      activeTool,
      reelIns,
      overlapSuggest,
      setOverlapSuggest,
      connectEndpoints,
    } = useStrawMobileStore.getState()

    if (activeTool === 'scissors' || shapes.length === 0) {
      if (dwellKeyRef.current !== null || overlapSuggest) {
        dwellKeyRef.current = null
        setOverlapSuggest(null)
      }
      return
    }

    const hangingIds = getHangingShapeIds(connections)
    const reelingIds = new Set(reelIns.map((reel) => reel.shapeId))
    const pair = findClosestOverlappingPair(shapes, connections, hangingIds, OVERLAP_RADIUS)

    if (!pair) {
      if (dwellKeyRef.current !== null || overlapSuggest) {
        dwellKeyRef.current = null
        setOverlapSuggest(null)
      }
      return
    }

    // Skip while either end is mid reel-in (poses are animating).
    const bodyA = endpointBodyKey(pair.a)
    const bodyB = endpointBodyKey(pair.b)
    if (reelingIds.has(bodyA) || reelingIds.has(bodyB)) {
      if (dwellKeyRef.current !== null || overlapSuggest) {
        dwellKeyRef.current = null
        setOverlapSuggest(null)
      }
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
