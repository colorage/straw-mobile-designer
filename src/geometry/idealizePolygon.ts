import * as THREE from 'three'

/**
 * Canonical closure for a simple loop of straws.
 *
 * Side lengths alone do not fix the angles of a loop with 4+ bars — the free
 * tighten solver happily converges on a parallelogram — so baking whatever
 * configuration existed at fuse time freezes an arbitrary skew. The cyclic
 * polygon (every corner on one circle) is the unique maximal-symmetry closure
 * for the given side lengths: equal sides give a square / regular N-gon,
 * alternating long-short gives a rectangle, and a triangle is unchanged.
 */

/** Sides within this relative tolerance count as equal (skip the bisection). */
const EQUAL_SIDE_EPS = 1e-3
/** Corners may move at most this fraction of the longest side when snapping. */
const MAX_SNAP_FRACTION = 0.9
const BISECTION_ITERATIONS = 100

interface Ring {
  /** Vertex indices in ring order. */
  order: number[]
  /** Side length from order[i] to order[i + 1] (wrapping). */
  sides: number[]
}

/** Walk the ring when the graph is a single simple cycle; null otherwise. */
function traceSimpleCycle(
  vertexCount: number,
  edges: [number, number][],
  restLengths: number[],
): Ring | null {
  if (vertexCount < 3 || edges.length !== vertexCount) return null

  const adjacency: { to: number; edgeIndex: number }[][] = Array.from(
    { length: vertexCount },
    () => [],
  )
  edges.forEach(([a, b], edgeIndex) => {
    if (a === b || a < 0 || b < 0 || a >= vertexCount || b >= vertexCount) return
    adjacency[a].push({ to: b, edgeIndex })
    adjacency[b].push({ to: a, edgeIndex })
  })
  if (adjacency.some((list) => list.length !== 2)) return null

  const order: number[] = [0]
  const sides: number[] = []
  let previousEdge = -1
  let current = 0
  for (let step = 0; step < vertexCount; step++) {
    const next = adjacency[current].find((edge) => edge.edgeIndex !== previousEdge)
    if (!next) return null
    sides.push(restLengths[next.edgeIndex])
    previousEdge = next.edgeIndex
    current = next.to
    if (current === 0) {
      // Closed — a genuine single cycle visits every vertex first.
      return step === vertexCount - 1 ? { order, sides } : null
    }
    order.push(current)
  }
  return null
}

/**
 * Circumradius of the cyclic polygon with the given side lengths.
 * Solves sum(2 asin(s_i / 2R)) = 2pi; monotone decreasing in R, so bisection.
 */
function solveCircumradius(sides: number[]): number | null {
  const max = Math.max(...sides)
  const min = Math.min(...sides)
  if (min <= 0) return null

  if ((max - min) / max < EQUAL_SIDE_EPS) {
    return max / (2 * Math.sin(Math.PI / sides.length))
  }

  const angleSum = (radius: number) =>
    sides.reduce((sum, side) => sum + 2 * Math.asin(Math.min(1, side / (2 * radius))), 0)

  let low = max / 2
  // Center-outside case (one dominant side) — cannot happen for a loop that
  // physically closed with near-touching corners, so just decline.
  if (angleSum(low) < 2 * Math.PI) return null

  let high = max
  while (angleSum(high) > 2 * Math.PI) high *= 2

  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (low + high) / 2
    if (angleSum(mid) > 2 * Math.PI) {
      low = mid
    } else {
      high = mid
    }
  }
  return (low + high) / 2
}

/** Polygon normal via Newell's method (robust for slightly skew rings). */
function newellNormal(ring: THREE.Vector3[]): THREE.Vector3 | null {
  const normal = new THREE.Vector3()
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    normal.x += (a.y - b.y) * (a.z + b.z)
    normal.y += (a.z - b.z) * (a.x + b.x)
    normal.z += (a.x - b.x) * (a.y + b.y)
  }
  if (normal.lengthSq() < 1e-12) return null
  return normal.normalize()
}

/**
 * Snap a fused loop's corners to its canonical cyclic polygon.
 *
 * Returns replacement world positions (indexed like `worldVertices`), or null
 * when the graph is not a simple cycle (braced / 3D clusters are already
 * determined by their edge lengths), the polygon cannot be built, or the snap
 * would teleport a corner. Side lengths come from `restLengths` — the straws'
 * authored lengths — so welding stretch is repaired at the same time.
 */
export function idealizeSimpleCycle(
  worldVertices: THREE.Vector3[],
  edges: [number, number][],
  restLengths: number[],
): THREE.Vector3[] | null {
  const ring = traceSimpleCycle(worldVertices.length, edges, restLengths)
  if (!ring) return null

  const radius = solveCircumradius(ring.sides)
  if (radius === null || !Number.isFinite(radius)) return null

  // Ideal ring in 2D, counterclockwise on the circumcircle, first edge along +x.
  const angles: number[] = [0]
  for (let i = 0; i < ring.sides.length - 1; i++) {
    angles.push(angles[i] + 2 * Math.asin(Math.min(1, ring.sides[i] / (2 * radius))))
  }
  const points = angles.map(
    (angle) => new THREE.Vector2(radius * Math.cos(angle), radius * Math.sin(angle)),
  )
  const firstEdge = points[1].clone().sub(points[0])
  const spin = -Math.atan2(firstEdge.y, firstEdge.x)
  const center2d = new THREE.Vector2()
  for (const point of points) {
    point.rotateAround(new THREE.Vector2(0, 0), spin)
    center2d.add(point)
  }
  center2d.multiplyScalar(1 / points.length)
  for (const point of points) point.sub(center2d)

  // Embed onto the baked ring: same plane (Newell normal), same corner
  // centroid, ideal first edge aligned with the baked first edge.
  const baked = ring.order.map((index) => worldVertices[index])
  const normal = newellNormal(baked)
  if (!normal) return null

  const centroid = new THREE.Vector3()
  for (const point of baked) centroid.add(point)
  centroid.multiplyScalar(1 / baked.length)

  const xAxis = baked[1].clone().sub(baked[0])
  xAxis.addScaledVector(normal, -xAxis.dot(normal))
  if (xAxis.lengthSq() < 1e-12) return null
  xAxis.normalize()
  const yAxis = normal.clone().cross(xAxis)

  const maxSnap = MAX_SNAP_FRACTION * Math.max(...ring.sides)
  const result: THREE.Vector3[] = new Array(worldVertices.length)
  for (let i = 0; i < ring.order.length; i++) {
    const world = centroid
      .clone()
      .addScaledVector(xAxis, points[i].x)
      .addScaledVector(yAxis, points[i].y)
    if (world.distanceTo(baked[i]) > maxSnap) return null
    result[ring.order[i]] = world
  }
  return result
}
