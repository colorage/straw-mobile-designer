export type Vector3Tuple = [number, number, number]
export type Edge = [number, number]

export interface PrimitiveGeometry {
  vertices: Vector3Tuple[]
  edges: Edge[]
}

const distance = (a: Vector3Tuple, b: Vector3Tuple) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * Uniformly rescales vertices so the given edges average exactly unit length.
 * Every primitive is authored in "1 straw = 1 unit" space; the shape's
 * chosen straw size is applied on top of this later.
 */
function normalizeToUnitEdges(vertices: Vector3Tuple[], edges: Edge[]): Vector3Tuple[] {
  const averageLength =
    edges.reduce((sum, [a, b]) => sum + distance(vertices[a], vertices[b]), 0) / edges.length
  const scale = 1 / averageLength
  return vertices.map(([x, y, z]) => [x * scale, y * scale, z * scale])
}

/** A single straw line: two endpoints, one edge. */
export function straw(): PrimitiveGeometry {
  return {
    vertices: [
      [0, -0.5, 0],
      [0, 0.5, 0],
    ],
    edges: [[0, 1]],
  }
}

/** A 3-corner (triangular) pyramid: a regular tetrahedron, all 6 edges equal. */
export function tetrahedron(): PrimitiveGeometry {
  const vertices: Vector3Tuple[] = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ]
  const edges: Edge[] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ]
  return { vertices: normalizeToUnitEdges(vertices, edges), edges }
}

/** A flat equilateral triangle loop: 3 corners, 3 equal straw edges. */
export function triangle(): PrimitiveGeometry {
  const h = Math.sqrt(3) / 2
  const vertices: Vector3Tuple[] = [
    [1, 0, 0],
    [-0.5, 0, h],
    [-0.5, 0, -h],
  ]
  const edges: Edge[] = [
    [0, 1],
    [1, 2],
    [2, 0],
  ]
  return { vertices: normalizeToUnitEdges(vertices, edges), edges }
}

/** A flat square loop: 4 corners, 4 equal straw edges. */
export function square(): PrimitiveGeometry {
  const vertices: Vector3Tuple[] = [
    [0.5, 0, 0.5],
    [0.5, 0, -0.5],
    [-0.5, 0, -0.5],
    [-0.5, 0, 0.5],
  ]
  const edges: Edge[] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ]
  return { vertices: normalizeToUnitEdges(vertices, edges), edges }
}

/**
 * A 4-corner (square) pyramid with all 8 edges equal length — the apex sits
 * at height 1/sqrt(2) above the base so lateral edges match the base edges,
 * exactly half of a regular octahedron.
 */
export function squarePyramid(): PrimitiveGeometry {
  const vertices: Vector3Tuple[] = [
    [0.5, 0, 0.5],
    [0.5, 0, -0.5],
    [-0.5, 0, -0.5],
    [-0.5, 0, 0.5],
    [0, Math.SQRT1_2, 0],
  ]
  const edges: Edge[] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [0, 4],
    [1, 4],
    [2, 4],
    [3, 4],
  ]
  return { vertices: normalizeToUnitEdges(vertices, edges), edges }
}

/** The classic himmeli "diamond": a regular octahedron, all 12 edges equal. */
export function octahedron(): PrimitiveGeometry {
  const a = Math.SQRT1_2
  const vertices: Vector3Tuple[] = [
    [a, 0, 0],
    [-a, 0, 0],
    [0, a, 0],
    [0, -a, 0],
    [0, 0, a],
    [0, 0, -a],
  ]
  const oppositePairs: Edge[] = [
    [0, 1],
    [2, 3],
    [4, 5],
  ]
  const isOpposite = (i: number, j: number) =>
    oppositePairs.some(([a, b]) => (a === i && b === j) || (a === j && b === i))

  const edges: Edge[] = []
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      if (!isOpposite(i, j)) edges.push([i, j])
    }
  }
  return { vertices: normalizeToUnitEdges(vertices, edges), edges }
}

export type ShapeKind =
  | 'straw'
  | 'triangle'
  | 'tetrahedron'
  | 'square'
  | 'squarePyramid'
  | 'octahedron'

export const PRIMITIVE_GENERATORS: Record<ShapeKind, () => PrimitiveGeometry> = {
  straw,
  triangle,
  tetrahedron,
  square,
  squarePyramid,
  octahedron,
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  straw: 'Straw Line',
  triangle: 'Triangle',
  tetrahedron: '3-Corner Pyramid',
  square: 'Square',
  squarePyramid: '4-Corner Pyramid',
  octahedron: 'Octahedron',
}
