import * as THREE from 'three'
import { getEndpointWorldPosition } from '../scene/endpointPosition'
import { BASE_STRAW_LENGTH } from '../state/shapeSpace'
import type { Connection, EndpointRef, Shape } from '../state/types'
import type { Vector3Tuple } from './primitives'

export interface ExplodedAssembly {
  /** One straw shape per surviving edge, at the assembly's live world pose. */
  shapes: Shape[]
  /** Threads re-tying the straws that used to share a welded corner. */
  connections: Connection[]
  /** Assembly vertex index → the straw endpoint that now stands in for it. */
  endpointByVertex: Map<number, EndpointRef>
}

function strawFromCorners(
  id: string,
  size: Shape['size'],
  from: THREE.Vector3,
  to: THREE.Vector3,
): Shape {
  const scale = size * BASE_STRAW_LENGTH
  const mid = from.clone().add(to).multiplyScalar(0.5)
  const local = (point: THREE.Vector3): Vector3Tuple => [
    (point.x - mid.x) / scale,
    (point.y - mid.y) / scale,
    (point.z - mid.z) / scale,
  ]
  return {
    id,
    kind: 'straw',
    size,
    vertices: [local(from), local(to)],
    edges: [[0, 1]],
    position: [mid.x, mid.y, mid.z],
    quaternion: [0, 0, 0, 1],
  }
}

/**
 * Break a fused piece back into the straws it was built from, optionally
 * dropping one of them (the straw the scissors landed on).
 *
 * Each welded corner becomes a chain of threads between the straw ends that
 * met there, so the pieces stay tied exactly as the user tied them — closed
 * loops among the survivors can then simply fuse again.
 */
export function explodeAssembly(
  assembly: Shape,
  createId: () => string,
  cutEdgeIndex?: number,
): ExplodedAssembly | null {
  const shapesById = new Map([[assembly.id, assembly]])
  const worldVertices: THREE.Vector3[] = []
  for (let vertexIndex = 0; vertexIndex < assembly.vertices.length; vertexIndex++) {
    const world = getEndpointWorldPosition(
      { kind: 'shape', shapeId: assembly.id, vertexIndex },
      shapesById,
    )
    if (!world) return null
    worldVertices.push(world)
  }

  const shapes: Shape[] = []
  const endsAtVertex = new Map<number, EndpointRef[]>()
  assembly.edges.forEach(([a, b], edgeIndex) => {
    if (edgeIndex === cutEdgeIndex) return
    const strawId = createId()
    shapes.push(strawFromCorners(strawId, assembly.size, worldVertices[a], worldVertices[b]))
    for (const [assemblyVertex, strawVertex] of [
      [a, 0],
      [b, 1],
    ] as const) {
      const list = endsAtVertex.get(assemblyVertex) ?? []
      list.push({ kind: 'shape', shapeId: strawId, vertexIndex: strawVertex })
      endsAtVertex.set(assemblyVertex, list)
    }
  })
  if (shapes.length === 0) return null

  const connections: Connection[] = []
  const endpointByVertex = new Map<number, EndpointRef>()
  for (const [assemblyVertex, ends] of endsAtVertex) {
    endpointByVertex.set(assemblyVertex, ends[0])
    for (let i = 1; i < ends.length; i++) {
      connections.push({ id: createId(), a: ends[i - 1], b: ends[i] })
    }
  }

  return { shapes, connections, endpointByVertex }
}
