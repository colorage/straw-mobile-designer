import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { ANCHOR_POSITION, getScaledVertex } from '../state/shapeSpace'
import { endpointBodyKey, type Connection, type EndpointRef, type Shape } from '../state/types'

function worldVertexOffset(shape: Shape, vertexIndex: number): THREE.Vector3 {
  const [x, y, z] = getScaledVertex(shape, vertexIndex)
  return new THREE.Vector3(x, y, z).applyQuaternion(new THREE.Quaternion(...shape.quaternion))
}

/** Undirected adjacency over body keys ('anchor' or shape id) derived from connections. */
function buildAdjacency(
  connections: Connection[],
): Map<string, { self: EndpointRef; other: EndpointRef }[]> {
  const adjacency = new Map<string, { self: EndpointRef; other: EndpointRef }[]>()
  const addEdge = (self: EndpointRef, other: EndpointRef) => {
    const key = endpointBodyKey(self)
    const list = adjacency.get(key) ?? []
    list.push({ self, other })
    adjacency.set(key, list)
  }
  for (const connection of connections) {
    addEdge(connection.a, connection.b)
    addEdge(connection.b, connection.a)
  }
  return adjacency
}

/**
 * Shape ids reachable from the fixed ceiling hook through the connection
 * graph. These form the hanging chain that should run under gravity; every
 * other shape stays kinematic on the workbench until it joins this set.
 */
export function getHangingShapeIds(connections: Connection[]): Set<string> {
  const adjacency = buildAdjacency(connections)
  const hanging = new Set<string>()
  const visited = new Set<string>(['anchor'])
  const queue: string[] = ['anchor']

  while (queue.length > 0) {
    const bodyKey = queue.shift()!
    for (const { other } of adjacency.get(bodyKey) ?? []) {
      if (other.kind === 'anchor') continue
      const otherKey = endpointBodyKey(other)
      if (visited.has(otherKey)) continue
      visited.add(otherKey)
      hanging.add(otherKey)
      queue.push(otherKey)
    }
  }

  return hanging
}

/**
 * Free (kinematic) shapes sit wherever they were placed on the workbench, often
 * meters away from where their threads pull them once they join the hanging
 * chain. Left as-is, every joint starts out badly stretched, and the very
 * first physics step slams each connected piece toward its neighbor to close
 * that gap — with the impulse from one snap feeding into the next down a
 * chain, so three or more linked pieces launch each other around instead of
 * settling.
 *
 * This precomputes a plausible resting layout by walking the connection
 * graph outward from the fixed anchor (breadth-first) and sliding each
 * not-yet-placed shape so its connecting corner already coincides with the
 * corner it's tied to. Orientation is left untouched — only the translation
 * needed to close each joint's gap is solved for — so the simulation starts
 * from (near) zero joint error instead of a violent teleport-sized one.
 * Shapes that aren't reachable from the anchor are left where they are and
 * stay kinematic on the workbench until a later connection pulls them in.
 */
export function computeRestingPositions(
  shapes: Shape[],
  connections: Connection[],
  /**
   * Shape ids whose current transforms are already authoritative (e.g. live
   * hanging bodies). They are walked for BFS but not repositioned.
   */
  fixedShapeIds: ReadonlySet<string> = new Set(),
): Map<string, Vector3Tuple> {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const resolvedPositions = new Map<string, Vector3Tuple>()
  const adjacency = buildAdjacency(connections)

  const worldPositionOf = (endpoint: EndpointRef): THREE.Vector3 | null => {
    if (endpoint.kind === 'anchor') return new THREE.Vector3(...ANCHOR_POSITION)
    const shape = shapesById.get(endpoint.shapeId)
    if (!shape) return null
    const position = resolvedPositions.get(shape.id) ?? shape.position
    return worldVertexOffset(shape, endpoint.vertexIndex).add(new THREE.Vector3(...position))
  }

  const visited = new Set<string>(['anchor'])
  const queue: string[] = ['anchor']

  while (queue.length > 0) {
    const bodyKey = queue.shift()!
    for (const { self, other } of adjacency.get(bodyKey) ?? []) {
      if (other.kind === 'anchor') continue
      const otherKey = endpointBodyKey(other)
      if (visited.has(otherKey)) continue

      const otherShape = shapesById.get(other.shapeId)
      if (!otherShape) continue

      if (fixedShapeIds.has(otherKey)) {
        // Keep the live/store pose; still traverse outward from here.
        visited.add(otherKey)
        queue.push(otherKey)
        continue
      }

      const targetWorldPos = worldPositionOf(self)
      if (!targetWorldPos) continue

      const localOffset = worldVertexOffset(otherShape, other.vertexIndex)
      const newPosition = targetWorldPos.clone().sub(localOffset)
      resolvedPositions.set(otherShape.id, [newPosition.x, newPosition.y, newPosition.z])

      visited.add(otherKey)
      queue.push(otherKey)
    }
  }

  return resolvedPositions
}
