import * as THREE from 'three'
import { getEndpointWorldPosition } from '../scene/endpointPosition'
import { BASE_STRAW_LENGTH } from '../state/shapeSpace'
import { endpointVertexKey, type Connection, type Shape } from '../state/types'
import { idealizeSimpleCycle } from './idealizePolygon'
import type { Vector3Tuple } from './primitives'

export interface FusedShape {
  shape: Shape
  /** `endpointVertexKey` of every merged corner → its index in the fused shape. */
  vertexMap: Map<string, number>
}

/**
 * How far a corner may be dragged onto its weld partner, as a fraction of a
 * straw. Welding averages tied corners, so a loop still holding a long thread
 * would snap shut and visibly stretch its straws — better to leave it floppy.
 */
const MAX_WELD_OFFSET_FRACTION = 0.15
/** Floor for the weld tolerance so 1/4-size loops can still close. */
const MIN_WELD_OFFSET = 0.1

/** Disjoint-set over vertex keys so every threaded corner collapses to one vertex. */
function createUnionFind() {
  const parent = new Map<string, string>()

  const find = (key: string): string => {
    let root = parent.get(key) ?? key
    if (root === key) {
      parent.set(key, key)
      return key
    }
    root = find(root)
    parent.set(key, root)
    return root
  }

  return {
    find,
    union: (a: string, b: string) => {
      const rootA = find(a)
      const rootB = find(b)
      if (rootA !== rootB) parent.set(rootB, rootA)
    },
  }
}

/**
 * Merge threaded shapes into one rigid shape, exactly like a toolbar primitive.
 *
 * Corners tied by `internalConnections` collapse into a single vertex at the
 * average of their live world positions, and every member's straws become edges
 * of the fused shape. Geometry is baked as-authored rather than normalized to
 * unit edges, so the fused piece keeps the shape the user actually built.
 */
export function fuseShapes(
  members: Shape[],
  internalConnections: Connection[],
  id: string,
): FusedShape | null {
  if (members.length < 2) return null

  // Mixed sizes are welcome: geometry is baked in the largest member's scale
  // and each straw keeps its own size via `edgeSizes` for inventory/scissors.
  const size = members.reduce(
    (largest, shape) => (shape.size > largest ? shape.size : largest),
    members[0].size,
  )
  const minSize = members.reduce(
    (smallest, shape) => (shape.size < smallest ? shape.size : smallest),
    members[0].size,
  )
  const scale = size * BASE_STRAW_LENGTH
  if (scale <= 0) return null

  const shapesById = new Map(members.map((shape) => [shape.id, shape]))
  const worldByKey = new Map<string, THREE.Vector3>()
  for (const shape of members) {
    for (let vertexIndex = 0; vertexIndex < shape.vertices.length; vertexIndex++) {
      const endpoint = { kind: 'shape' as const, shapeId: shape.id, vertexIndex }
      const world = getEndpointWorldPosition(endpoint, shapesById)
      if (!world) return null
      worldByKey.set(endpointVertexKey(endpoint), world)
    }
  }

  const unionFind = createUnionFind()
  for (const key of worldByKey.keys()) unionFind.find(key)
  for (const connection of internalConnections) {
    if (connection.a.kind !== 'shape' || connection.b.kind !== 'shape') continue
    const keyA = endpointVertexKey(connection.a)
    const keyB = endpointVertexKey(connection.b)
    if (!worldByKey.has(keyA) || !worldByKey.has(keyB)) continue
    unionFind.union(keyA, keyB)
  }

  // One fused vertex per weld group, positioned at the group's average corner.
  const groupSums = new Map<string, { sum: THREE.Vector3; count: number }>()
  for (const [key, world] of worldByKey) {
    const root = unionFind.find(key)
    const entry = groupSums.get(root)
    if (entry) {
      entry.sum.add(world)
      entry.count += 1
    } else {
      groupSums.set(root, { sum: world.clone(), count: 1 })
    }
  }

  const indexByRoot = new Map<string, number>()
  const worldVertices: THREE.Vector3[] = []
  for (const [root, { sum, count }] of groupSums) {
    indexByRoot.set(root, worldVertices.length)
    worldVertices.push(sum.multiplyScalar(1 / count))
  }

  // Tolerance follows the smallest member so short straws still weld tightly.
  const maxOffset = Math.max(
    MIN_WELD_OFFSET,
    MAX_WELD_OFFSET_FRACTION * minSize * BASE_STRAW_LENGTH,
  )
  for (const [key, world] of worldByKey) {
    const merged = worldVertices[indexByRoot.get(unionFind.find(key))!]
    if (world.distanceTo(merged) > maxOffset) return null
  }

  const vertexMap = new Map<string, number>()
  for (const key of worldByKey.keys()) {
    vertexMap.set(key, indexByRoot.get(unionFind.find(key))!)
  }

  const edges: [number, number][] = []
  const edgeRestLengths: number[] = []
  const edgeSizes: Shape['size'][] = []
  const seenEdges = new Set<string>()
  for (const shape of members) {
    const memberScale = shape.size * BASE_STRAW_LENGTH
    for (let edgeIndex = 0; edgeIndex < shape.edges.length; edgeIndex++) {
      const [localA, localB] = shape.edges[edgeIndex]
      const a = vertexMap.get(`${shape.id}:${localA}`)
      const b = vertexMap.get(`${shape.id}:${localB}`)
      if (a === undefined || b === undefined || a === b) continue
      const edgeKey = a < b ? `${a}-${b}` : `${b}-${a}`
      if (seenEdges.has(edgeKey)) continue
      seenEdges.add(edgeKey)
      edges.push([a, b])
      const [ax, ay, az] = shape.vertices[localA]
      const [bx, by, bz] = shape.vertices[localB]
      edgeRestLengths.push(Math.hypot(ax - bx, ay - by, az - bz) * memberScale)
      edgeSizes.push(shape.edgeSizes?.[edgeIndex] ?? shape.size)
    }
  }
  if (edges.length === 0) return null

  // A simple loop's angles are not determined by its side lengths — the
  // tighten solver may have closed it as a parallelogram. Snap those corners
  // to the canonical cyclic polygon (square, rectangle, regular N-gon) built
  // from the straws' authored lengths; braced / 3D clusters keep their pose.
  const idealized = idealizeSimpleCycle(worldVertices, edges, edgeRestLengths)
  const finalVertices = idealized ?? worldVertices

  const center = new THREE.Vector3()
  for (const vertex of finalVertices) center.add(vertex)
  center.multiplyScalar(1 / finalVertices.length)

  const vertices: Vector3Tuple[] = finalVertices.map((vertex) => [
    (vertex.x - center.x) / scale,
    (vertex.y - center.y) / scale,
    (vertex.z - center.z) / scale,
  ])

  return {
    shape: {
      id,
      kind: 'assembly',
      size,
      vertices,
      edges,
      edgeSizes,
      // World geometry is baked into the vertices, so the fused piece starts
      // unrotated at its own centroid.
      position: [center.x, center.y, center.z],
      quaternion: [0, 0, 0, 1],
    },
    vertexMap,
  }
}
