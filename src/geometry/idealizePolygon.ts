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
const BISECTION_ITERATIONS = 100
const POWER_ITERATIONS = 48

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

type Matrix3x3 = [number, number, number, number, number, number, number, number, number]

function applyMatrix(m: Matrix3x3, v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    m[0] * v.x + m[1] * v.y + m[2] * v.z,
    m[3] * v.x + m[4] * v.y + m[5] * v.z,
    m[6] * v.x + m[7] * v.y + m[8] * v.z,
  )
}

/** Dominant eigenvector of a symmetric PSD matrix by power iteration. */
function dominantDirection(m: Matrix3x3, start: THREE.Vector3): THREE.Vector3 | null {
  const v = start.clone()
  if (v.lengthSq() < 1e-12) return null
  v.normalize()
  for (let i = 0; i < POWER_ITERATIONS; i++) {
    const next = applyMatrix(m, v)
    if (next.lengthSq() < 1e-12) return null
    v.copy(next.normalize())
  }
  return v
}

/**
 * Plane through the baked corners via principal component analysis.
 *
 * Newell's method fails exactly when we need the snap most: a loop that folded
 * flat traces a bowtie whose signed-area contributions cancel, leaving a
 * garbage normal. PCA keeps working — the plane holds the two largest spreads
 * of the corner cloud, and a fully collinear "needle" still gets its long axis
 * plus an arbitrary perpendicular so the polygon has somewhere to open up.
 */
function principalPlane(
  offsets: THREE.Vector3[],
): { xAxis: THREE.Vector3; yAxis: THREE.Vector3 } | null {
  let covariance: Matrix3x3 = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (const p of offsets) {
    covariance = [
      covariance[0] + p.x * p.x,
      covariance[1] + p.x * p.y,
      covariance[2] + p.x * p.z,
      covariance[3] + p.y * p.x,
      covariance[4] + p.y * p.y,
      covariance[5] + p.y * p.z,
      covariance[6] + p.z * p.x,
      covariance[7] + p.z * p.y,
      covariance[8] + p.z * p.z,
    ]
  }

  // Deterministic start: the farthest corner from the centroid.
  let start = offsets[0]
  for (const p of offsets) if (p.lengthSq() > start.lengthSq()) start = p
  const xAxis = dominantDirection(covariance, start)
  if (!xAxis) return null

  // Deflate the dominant direction, then repeat for the in-plane second axis.
  const lambda = applyMatrix(covariance, xAxis).dot(xAxis)
  const deflated: Matrix3x3 = [
    covariance[0] - lambda * xAxis.x * xAxis.x,
    covariance[1] - lambda * xAxis.x * xAxis.y,
    covariance[2] - lambda * xAxis.x * xAxis.z,
    covariance[3] - lambda * xAxis.y * xAxis.x,
    covariance[4] - lambda * xAxis.y * xAxis.y,
    covariance[5] - lambda * xAxis.y * xAxis.z,
    covariance[6] - lambda * xAxis.z * xAxis.x,
    covariance[7] - lambda * xAxis.z * xAxis.y,
    covariance[8] - lambda * xAxis.z * xAxis.z,
  ]
  let secondStart = new THREE.Vector3()
  for (const p of offsets) {
    const perpendicular = p.clone().addScaledVector(xAxis, -p.dot(xAxis))
    if (perpendicular.lengthSq() > secondStart.lengthSq()) secondStart = perpendicular
  }
  let yAxis = dominantDirection(deflated, secondStart)
  if (yAxis) {
    // Re-orthogonalize (power iteration drift on near-degenerate spectra).
    yAxis.addScaledVector(xAxis, -yAxis.dot(xAxis))
    if (yAxis.lengthSq() < 1e-6) yAxis = null
    else yAxis.normalize()
  }
  if (!yAxis) {
    // Collinear needle: open the polygon in any plane holding the long axis.
    const up = Math.abs(xAxis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    yAxis = up.clone().addScaledVector(xAxis, -up.dot(xAxis)).normalize()
  }

  return { xAxis, yAxis }
}

/** Optimal in-plane rotation (2D Procrustes) of `ideal` onto `baked`. */
function fitRotation(
  ideal: THREE.Vector2[],
  baked: THREE.Vector2[],
): { points: THREE.Vector2[]; residual: number } {
  let cross = 0
  let dot = 0
  for (let i = 0; i < ideal.length; i++) {
    dot += ideal[i].x * baked[i].x + ideal[i].y * baked[i].y
    cross += ideal[i].x * baked[i].y - ideal[i].y * baked[i].x
  }
  const angle = Math.atan2(cross, dot)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const points = ideal.map(
    (p) => new THREE.Vector2(p.x * cos - p.y * sin, p.x * sin + p.y * cos),
  )
  let residual = 0
  for (let i = 0; i < points.length; i++) {
    residual += points[i].distanceToSquared(baked[i])
  }
  return { points, residual }
}

/**
 * Snap a fused loop's corners to its canonical cyclic polygon.
 *
 * Returns replacement world positions (indexed like `worldVertices`), or null
 * when the graph is not a simple cycle (braced / 3D clusters are already
 * determined by their edge lengths) or the polygon cannot be built. Side
 * lengths come from `restLengths` — the straws' authored lengths — so welding
 * stretch is repaired at the same time. Folded or fully collapsed loops are
 * deliberately still snapped: rescuing a loop that closed as a flat "needle"
 * is the whole point, even though its corners travel further.
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

  // Ideal ring in 2D, counterclockwise on the circumcircle, centered.
  const angles: number[] = [0]
  for (let i = 0; i < ring.sides.length - 1; i++) {
    angles.push(angles[i] + 2 * Math.asin(Math.min(1, ring.sides[i] / (2 * radius))))
  }
  const ideal = angles.map(
    (angle) => new THREE.Vector2(radius * Math.cos(angle), radius * Math.sin(angle)),
  )
  const center2d = new THREE.Vector2()
  for (const point of ideal) center2d.add(point)
  center2d.multiplyScalar(1 / ideal.length)
  for (const point of ideal) point.sub(center2d)

  // Embed onto the baked ring: PCA plane through the corners, then the
  // in-plane rotation (trying both windings) that moves corners the least.
  const baked = ring.order.map((index) => worldVertices[index])
  const centroid = new THREE.Vector3()
  for (const point of baked) centroid.add(point)
  centroid.multiplyScalar(1 / baked.length)
  const offsets = baked.map((point) => point.clone().sub(centroid))

  const plane = principalPlane(offsets)
  if (!plane) return null

  const baked2d = offsets.map(
    (offset) => new THREE.Vector2(offset.dot(plane.xAxis), offset.dot(plane.yAxis)),
  )
  const direct = fitRotation(ideal, baked2d)
  const mirrored = fitRotation(
    ideal.map((p) => new THREE.Vector2(p.x, -p.y)),
    baked2d,
  )
  const fitted = mirrored.residual < direct.residual ? mirrored.points : direct.points

  const result: THREE.Vector3[] = new Array(worldVertices.length)
  for (let i = 0; i < ring.order.length; i++) {
    result[ring.order[i]] = centroid
      .clone()
      .addScaledVector(plane.xAxis, fitted[i].x)
      .addScaledVector(plane.yAxis, fitted[i].y)
  }
  return result
}
