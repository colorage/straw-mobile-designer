import type { Connection, EndpointRef, Shape } from '../state/types'
import { endpointBodyKey, endpointVertexKey, endpointsEqual } from '../state/types'
import { getEndpointWorldPosition } from './endpointPosition'

/** World-space distance under which two corners count as overlapping. */
export const OVERLAP_RADIUS = 0.2

/** Continuous proximity required before auto-connecting (ms). */
export const OVERLAP_DWELL_MS = 2500

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

/**
 * Closest pair of unconnected corners among free shapes + the ceiling hook
 * that currently lie within `radius`. Hanging shapes are excluded so sway
 * under gravity cannot false-trigger auto-connect.
 */
export function findClosestOverlappingPair(
  shapes: Shape[],
  connections: Connection[],
  hangingIds: Set<string>,
  radius: number = OVERLAP_RADIUS,
): OverlapPair | null {
  const freeShapes = shapes.filter((shape) => !hangingIds.has(shape.id))
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))

  const endpoints: EndpointRef[] = [{ kind: 'anchor' }]
  for (const shape of freeShapes) {
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
