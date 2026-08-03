import * as THREE from 'three'
import type { Connection, EndpointRef, Shape } from '../state/types'
import { endpointBodyKey, endpointVertexKey } from '../state/types'
import {
  getEndpointPoseContext,
  writeEndpointWorldPosition,
} from './endpointPosition'

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

/** Body keys already tied directly to this endpoint (its joint neighbors). */
function neighborBodyKeys(connections: Connection[], endpoint: EndpointRef): Set<string> {
  const neighbors = new Set<string>()
  for (const connection of connections) {
    if (endpointVertexKey(connection.a) === endpointVertexKey(endpoint)) {
      neighbors.add(endpointBodyKey(connection.b))
    } else if (endpointVertexKey(connection.b) === endpointVertexKey(endpoint)) {
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

function cellCoord(value: number, cellSize: number): number {
  return Math.floor(value / cellSize)
}

function packCell(ix: number, iy: number, iz: number): number {
  // 10-bit signed axes packed into one int — enough for workbench-scale coords.
  return ((ix + 512) & 1023) | (((iy + 512) & 1023) << 10) | (((iz + 512) & 1023) << 20)
}

interface EndpointScratch {
  bodyKeys: string[]
  vertexKeys: string[]
  xs: Float32Array
  ys: Float32Array
  zs: Float32Array
  valid: Uint8Array
  capacity: number
}

const scratch: EndpointScratch = {
  bodyKeys: [],
  vertexKeys: [],
  xs: new Float32Array(0),
  ys: new Float32Array(0),
  zs: new Float32Array(0),
  valid: new Uint8Array(0),
  capacity: 0,
}

const worldPosScratch = new THREE.Vector3()

function ensureCapacity(count: number): void {
  if (count <= scratch.capacity) return
  const capacity = Math.max(count, scratch.capacity * 2 || 32)
  scratch.xs = new Float32Array(capacity)
  scratch.ys = new Float32Array(capacity)
  scratch.zs = new Float32Array(capacity)
  scratch.valid = new Uint8Array(capacity)
  scratch.capacity = capacity
}

/**
 * Closest pair of unconnected corners among all shapes + the ceiling hook
 * that currently lie within `radius`.
 *
 * Includes hanging pieces so free ends of hooked straws can auto-tie. Pairs
 * that already share a joint hub (co-located spokes) are skipped.
 *
 * Hot-path notes:
 * - Positions are written into reused typed arrays (no per-endpoint Vector3).
 * - Connected pairs + hub neighbors are precomputed once per scan.
 * - Candidates are culled with a uniform spatial hash before distance tests.
 */
export function findClosestOverlappingPair(
  shapes: Shape[],
  connections: Connection[],
  radius: number = OVERLAP_RADIUS,
): OverlapPair | null {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const poseContext = getEndpointPoseContext()

  const endpoints: EndpointRef[] = [{ kind: 'anchor' }]
  for (const shape of shapes) {
    for (let vertexIndex = 0; vertexIndex < shape.vertices.length; vertexIndex++) {
      endpoints.push({ kind: 'shape', shapeId: shape.id, vertexIndex })
    }
  }

  const count = endpoints.length
  ensureCapacity(count)
  scratch.bodyKeys.length = count
  scratch.vertexKeys.length = count

  for (let i = 0; i < count; i++) {
    const endpoint = endpoints[i]
    scratch.bodyKeys[i] = endpointBodyKey(endpoint)
    scratch.vertexKeys[i] = endpointVertexKey(endpoint)
    if (writeEndpointWorldPosition(endpoint, shapesById, worldPosScratch, poseContext)) {
      scratch.xs[i] = worldPosScratch.x
      scratch.ys[i] = worldPosScratch.y
      scratch.zs[i] = worldPosScratch.z
      scratch.valid[i] = 1
    } else {
      scratch.valid[i] = 0
    }
  }

  // Connected unordered pairs — O(1) reject in the inner loop.
  const connectedPairs = new Set<string>()
  // endpoint vertex key → neighbor body keys
  const neighborsByEndpoint = new Map<string, Set<string>>()
  for (const connection of connections) {
    connectedPairs.add(overlapPairKey(connection.a, connection.b))
    const ka = endpointVertexKey(connection.a)
    const kb = endpointVertexKey(connection.b)
    let na = neighborsByEndpoint.get(ka)
    if (!na) {
      na = new Set()
      neighborsByEndpoint.set(ka, na)
    }
    na.add(endpointBodyKey(connection.b))
    let nb = neighborsByEndpoint.get(kb)
    if (!nb) {
      nb = new Set()
      neighborsByEndpoint.set(kb, nb)
    }
    nb.add(endpointBodyKey(connection.a))
  }

  const sharesHub = (vertexKeyA: string, vertexKeyB: string): boolean => {
    const neighborsA = neighborsByEndpoint.get(vertexKeyA)
    if (!neighborsA || neighborsA.size === 0) return false
    const neighborsB = neighborsByEndpoint.get(vertexKeyB)
    if (!neighborsB || neighborsB.size === 0) return false
    for (const key of neighborsB) {
      if (neighborsA.has(key)) return true
    }
    return false
  }

  // Spatial hash: only compare endpoints that share a nearby cell.
  const cellSize = radius
  const grid = new Map<number, number[]>()
  for (let i = 0; i < count; i++) {
    if (!scratch.valid[i]) continue
    const key = packCell(
      cellCoord(scratch.xs[i], cellSize),
      cellCoord(scratch.ys[i], cellSize),
      cellCoord(scratch.zs[i], cellSize),
    )
    let bucket = grid.get(key)
    if (!bucket) {
      bucket = []
      grid.set(key, bucket)
    }
    bucket.push(i)
  }

  let best: OverlapPair | null = null
  const radiusSq = radius * radius

  for (let i = 0; i < count; i++) {
    if (!scratch.valid[i]) continue
    const ix = cellCoord(scratch.xs[i], cellSize)
    const iy = cellCoord(scratch.ys[i], cellSize)
    const iz = cellCoord(scratch.zs[i], cellSize)
    const bodyA = scratch.bodyKeys[i]
    const vertexA = scratch.vertexKeys[i]
    const ax = scratch.xs[i]
    const ay = scratch.ys[i]
    const az = scratch.zs[i]

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const bucket = grid.get(packCell(ix + ox, iy + oy, iz + oz))
          if (!bucket) continue
          for (let b = 0; b < bucket.length; b++) {
            const j = bucket[b]
            // Each unordered pair once.
            if (j <= i) continue
            if (!scratch.valid[j]) continue
            // Same rigid body — corners of one shape never auto-tie to each other.
            if (bodyA === scratch.bodyKeys[j]) continue

            const dx = ax - scratch.xs[j]
            const dy = ay - scratch.ys[j]
            const dz = az - scratch.zs[j]
            const distSq = dx * dx + dy * dy + dz * dz
            if (distSq > radiusSq) continue

            const vertexB = scratch.vertexKeys[j]!
            const pairKey =
              vertexA < vertexB ? `${vertexA}|${vertexB}` : `${vertexB}|${vertexA}`
            if (connectedPairs.has(pairKey)) continue
            if (sharesHub(vertexA, vertexB)) continue

            const distance = Math.sqrt(distSq)
            if (!best || distance < best.distance) {
              best = { a: endpoints[i], b: endpoints[j], distance }
            }
          }
        }
      }
    }
  }

  return best
}
