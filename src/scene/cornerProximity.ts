import type { Connection, EndpointRef, Shape } from '../state/types'
import { endpointBodyKey, endpointVertexKey, endpointsEqual } from '../state/types'
import { getEndpointWorldPosition } from './endpointPosition'

/** World-space distance under which two corners count as overlapping. */
export const OVERLAP_RADIUS = 0.2

/** Continuous proximity required before auto-connecting (ms). */
export const OVERLAP_DWELL_MS = 2500

/**
 * Max lin/ang speed (m/s, rad/s) for a hanging body to count as settled enough
 * for dwell to accumulate. Prevents sway fly-bys from starting a suggestion.
 */
export const OVERLAP_SETTLE_SPEED = 0.12

export interface OverlapPair {
  a: EndpointRef
  b: EndpointRef
  distance: number
}

/** Stable key for an unordered endpoint pair (sorted vertex keys). */
export function overlapPairKey(a: EndpointRef, b: EndpointRef): string {
  const ka = endpointVertexKey(a)
  const kb = endpointVertexKey(b)
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

function isAlreadyConnected(
  connections: Connection[],
  a: EndpointRef,
  b: EndpointRef,
): boolean {
  return connections.some(
    (connection) =>
      (endpointsEqual(connection.a, a) && endpointsEqual(connection.b, b)) ||
      (endpointsEqual(connection.a, b) && endpointsEqual(connection.b, a)),
  )
}

/** Body keys already tied directly to this endpoint (its joint neighbors). */
function neighborBodyKeys(connections: Connection[], endpoint: EndpointRef): Set<string> {
  const neighbors = new Set<string>()
  for (const connection of connections) {
    if (endpointsEqual(connection.a, endpoint)) {
      neighbors.add(endpointBodyKey(connection.b))
    } else if (endpointsEqual(connection.b, endpoint)) {
      neighbors.add(endpointBodyKey(connection.a))
    }
  }
  return neighbors
}

/**
 * True when both corners already share a hub body (e.g. two straw ends both
 * tied to the ceiling hook). Those corners coincide in space but must not
 * auto-suggest a redundant link between hub spokes.
 */
export function shareConnectionHub(
  connections: Connection[],
  a: EndpointRef,
  b: EndpointRef,
): boolean {
  const neighborsA = neighborBodyKeys(connections, a)
  if (neighborsA.size === 0) return false
  for (const key of neighborBodyKeys(connections, b)) {
    if (neighborsA.has(key)) return true
  }
  return false
}

/**
 * Closest pair of unconnected corners among all shapes + the ceiling hook
 * that currently lie within `radius`.
 *
 * Includes hanging pieces so free ends of hooked straws can auto-tie. Pairs
 * that already share a joint hub (co-located spokes) are skipped.
 */
export function findClosestOverlappingPair(
  shapes: Shape[],
  connections: Connection[],
  radius: number = OVERLAP_RADIUS,
): OverlapPair | null {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))

  const endpoints: EndpointRef[] = [{ kind: 'anchor' }]
  for (const shape of shapes) {
    for (let vertexIndex = 0; vertexIndex < shape.vertices.length; vertexIndex++) {
      endpoints.push({ kind: 'shape', shapeId: shape.id, vertexIndex })
    }
  }

  const positions = endpoints.map((endpoint) => getEndpointWorldPosition(endpoint, shapesById))

  let best: OverlapPair | null = null
  const radiusSq = radius * radius

  for (let i = 0; i < endpoints.length; i++) {
    const posA = positions[i]
    if (!posA) continue
    for (let j = i + 1; j < endpoints.length; j++) {
      const a = endpoints[i]
      const b = endpoints[j]
      // Same rigid body — corners of one shape never auto-tie to each other.
      if (endpointBodyKey(a) === endpointBodyKey(b)) continue
      if (isAlreadyConnected(connections, a, b)) continue
      if (shareConnectionHub(connections, a, b)) continue

      const posB = positions[j]
      if (!posB) continue

      const dx = posA.x - posB.x
      const dy = posA.y - posB.y
      const dz = posA.z - posB.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq > radiusSq) continue

      const distance = Math.sqrt(distSq)
      if (!best || distance < best.distance) {
        best = { a, b, distance }
      }
    }
  }

  return best
}
