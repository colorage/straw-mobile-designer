import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { ANCHOR_POSITION, getScaledVertex } from '../state/store'
import { endpointBodyKey, type Connection, type EndpointRef, type Shape } from '../state/types'

function worldVertexOffset(shape: Shape, vertexIndex: number): THREE.Vector3 {
  const [x, y, z] = getScaledVertex(shape, vertexIndex)
  return new THREE.Vector3(x, y, z).applyQuaternion(new THREE.Quaternion(...shape.quaternion))
}

/**
 * Build-mode shapes sit wherever they were placed on the workbench, often
 * meters away from where their threads pull them once gravity kicks in. Left
 * as-is, every joint starts out badly stretched, and the very first physics
 * step slams each connected piece toward its neighbor to close that gap —
 * with the impulse from one snap feeding into the next down a chain, so
 * three or more linked pieces launch each other around instead of settling.
 *
 * This precomputes a plausible resting layout by walking the connection
 * graph outward from the fixed anchor (breadth-first) and sliding each
 * not-yet-placed shape so its connecting corner already coincides with the
 * corner it's tied to. Orientation is left untouched — only the translation
 * needed to close each joint's gap is solved for — so the simulation starts
 * from (near) zero joint error instead of a violent teleport-sized one.
 * Shapes that aren't reachable from the anchor are left where they are and
 * simply fall onto the safety-net floor, same as before.
 */
export function computeRestingPositions(
  shapes: Shape[],
  connections: Connection[],
): Map<string, Vector3Tuple> {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const resolvedPositions = new Map<string, Vector3Tuple>()

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
      const targetWorldPos = worldPositionOf(self)
      if (!otherShape || !targetWorldPos) continue

      const localOffset = worldVertexOffset(otherShape, other.vertexIndex)
      const newPosition = targetWorldPos.clone().sub(localOffset)
      resolvedPositions.set(otherShape.id, [newPosition.x, newPosition.y, newPosition.z])

      visited.add(otherKey)
      queue.push(otherKey)
    }
  }

  return resolvedPositions
}
