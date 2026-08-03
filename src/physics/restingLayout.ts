import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { ANCHOR_POSITION } from '../state/shapeSpace'
import {
  endpointBodyKey,
  type Connection,
  type EndpointRef,
  type QuatTuple,
  type Shape,
  type ShapePose,
} from '../state/types'
import {
  hangQuaternionForVertex,
  localVertex,
  poseFromShape,
  quatTuple,
  quaternionAligning,
  rotateAttachmentToward,
  toVector3Tuple,
  worldVertexFromPose,
  type MutablePose,
} from './poseMath'
import { getRigidClusterShapeIds } from './rigidConnections'

const FREE_SOLVER_ITERATIONS = 56
const ROTATION_BLEND = 0.55
const MIN_POSE_DELTA = 0.015
const MIN_ANGLE_DELTA = 0.02

/** Undirected adjacency over body keys ('anchor' or shape id) derived from connections. */
export function buildAdjacency(
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

/** Free shape ids in the same thread component as `seed` (does not cross the anchor). */
export function getFreeComponentIds(
  connections: Connection[],
  seedShapeId: string,
): Set<string> {
  const adjacency = buildAdjacency(connections)
  const component = new Set<string>()
  const queue = [seedShapeId]
  component.add(seedShapeId)

  while (queue.length > 0) {
    const bodyKey = queue.shift()!
    for (const { other } of adjacency.get(bodyKey) ?? []) {
      if (other.kind === 'anchor') continue
      const otherKey = endpointBodyKey(other)
      if (component.has(otherKey)) continue
      component.add(otherKey)
      queue.push(otherKey)
    }
  }

  return component
}

function componentCentroid(
  shapeIds: Iterable<string>,
  poses: Map<string, MutablePose>,
): THREE.Vector3 {
  const center = new THREE.Vector3()
  let count = 0
  for (const id of shapeIds) {
    const pose = poses.get(id)
    if (!pose) continue
    center.add(pose.position)
    count += 1
  }
  if (count > 0) center.multiplyScalar(1 / count)
  return center
}

type VertexTarget = { vertexIndex: number; target: THREE.Vector3 }

/**
 * Orient a free shape from its tied corners. One pin → corner leads the pull;
 * two or more → align the local edge to the world edge (triangle sides, etc.).
 */
function projectShapeFromPins(
  shape: Shape,
  pose: MutablePose,
  pins: VertexTarget[],
  rotAmount: number,
): void {
  if (pins.length === 0) return

  if (pins.length >= 2) {
    const a = pins[0]
    const b = pins[1]
    const localA = localVertex(shape, a.vertexIndex)
    const localB = localVertex(shape, b.vertexIndex)
    const localDir = localB.clone().sub(localA)
    const worldDir = b.target.clone().sub(a.target)
    if (localDir.lengthSq() > 1e-12 && worldDir.lengthSq() > 1e-12) {
      const currentDir = localDir.clone().applyQuaternion(pose.quaternion)
      const delta = quaternionAligning(currentDir, worldDir)
      if (rotAmount < 1) delta.slerp(new THREE.Quaternion(), 1 - rotAmount)
      pose.quaternion.premultiply(delta).normalize()
    }
    const worldA = localVertex(shape, a.vertexIndex).applyQuaternion(pose.quaternion)
    pose.position.copy(a.target).sub(worldA)
    return
  }

  const pin = pins[0]
  const local = localVertex(shape, pin.vertexIndex)
  rotateAttachmentToward(pose.quaternion, local, pin.target.clone().sub(pose.position), rotAmount)
  const world = localVertex(shape, pin.vertexIndex).applyQuaternion(pose.quaternion)
  pose.position.copy(pin.target).sub(world)
}

/**
 * Iteratively close every thread gap in a free component while rotating each
 * piece so tied corners lead the pull. Cycles converge into closed polygons —
 * three equal straws tied end-to-end settle into a triangle on the workbench.
 */
function solveFreeComponentPoses(
  shapesById: Map<string, Shape>,
  componentIds: Set<string>,
  componentConnections: Connection[],
): Map<string, MutablePose> {
  const poses = new Map<string, MutablePose>()
  for (const id of componentIds) {
    const shape = shapesById.get(id)
    if (shape) poses.set(id, poseFromShape(shape))
  }

  const originalCenter = componentCentroid(componentIds, poses)

  for (let iter = 0; iter < FREE_SOLVER_ITERATIONS; iter++) {
    const rotAmount = ROTATION_BLEND * (0.4 + 0.6 * ((iter + 1) / FREE_SOLVER_ITERATIONS))

    // Softly close every thread (both ends move).
    for (const connection of componentConnections) {
      if (connection.a.kind !== 'shape' || connection.b.kind !== 'shape') continue
      const shapeA = shapesById.get(connection.a.shapeId)
      const shapeB = shapesById.get(connection.b.shapeId)
      const poseA = poses.get(connection.a.shapeId)
      const poseB = poses.get(connection.b.shapeId)
      if (!shapeA || !shapeB || !poseA || !poseB) continue

      const worldA = worldVertexFromPose(poseA, shapeA, connection.a.vertexIndex)
      const worldB = worldVertexFromPose(poseB, shapeB, connection.b.vertexIndex)
      const mid = worldA.clone().add(worldB).multiplyScalar(0.5)
      poseA.position.add(mid.clone().sub(worldA).multiplyScalar(0.5))
      poseB.position.add(mid.clone().sub(worldB).multiplyScalar(0.5))
    }

    // Joint targets = midpoints after the translation pass.
    const pinTargets = new Map<string, VertexTarget[]>()
    for (const connection of componentConnections) {
      if (connection.a.kind !== 'shape' || connection.b.kind !== 'shape') continue
      const shapeA = shapesById.get(connection.a.shapeId)
      const shapeB = shapesById.get(connection.b.shapeId)
      const poseA = poses.get(connection.a.shapeId)
      const poseB = poses.get(connection.b.shapeId)
      if (!shapeA || !shapeB || !poseA || !poseB) continue

      const worldA = worldVertexFromPose(poseA, shapeA, connection.a.vertexIndex)
      const worldB = worldVertexFromPose(poseB, shapeB, connection.b.vertexIndex)
      const mid = worldA.clone().add(worldB).multiplyScalar(0.5)

      const listA = pinTargets.get(connection.a.shapeId) ?? []
      listA.push({ vertexIndex: connection.a.vertexIndex, target: mid.clone() })
      pinTargets.set(connection.a.shapeId, listA)

      const listB = pinTargets.get(connection.b.shapeId) ?? []
      listB.push({ vertexIndex: connection.b.vertexIndex, target: mid.clone() })
      pinTargets.set(connection.b.shapeId, listB)
    }

    for (const [shapeId, pins] of pinTargets) {
      const shape = shapesById.get(shapeId)
      const pose = poses.get(shapeId)
      if (!shape || !pose) continue
      // Deduplicate by vertex (keep average target if a corner is multi-tied).
      const byVertex = new Map<number, THREE.Vector3[]>()
      for (const pin of pins) {
        const list = byVertex.get(pin.vertexIndex) ?? []
        list.push(pin.target)
        byVertex.set(pin.vertexIndex, list)
      }
      const unique: VertexTarget[] = []
      for (const [vertexIndex, targets] of byVertex) {
        const avg = new THREE.Vector3()
        for (const t of targets) avg.add(t)
        avg.multiplyScalar(1 / targets.length)
        unique.push({ vertexIndex, target: avg })
      }
      projectShapeFromPins(shape, pose, unique, rotAmount)
    }
  }

  // Keep the cluster where the user left it on the workbench.
  const solvedCenter = componentCentroid(componentIds, poses)
  const drift = originalCenter.sub(solvedCenter)
  if (drift.lengthSq() > 1e-12) {
    for (const pose of poses.values()) pose.position.add(drift)
  }

  return poses
}

function poseMapToShapePoses(poses: Map<string, MutablePose>): Map<string, ShapePose> {
  const result = new Map<string, ShapePose>()
  for (const [id, pose] of poses) {
    result.set(id, {
      position: toVector3Tuple(pose.position),
      quaternion: quatTuple(pose.quaternion),
    })
  }
  return result
}

/**
 * Target poses for a free↔free (or free cluster) thread tie. Moves every shape
 * in the connected free component — not just the newly clicked piece — so a
 * cycle of straws tightens into a closed polygon before anything hangs.
 */
export function computeFreeTightenPoses(
  shapes: Shape[],
  connections: Connection[],
  newConnection: Connection,
): Map<string, ShapePose> {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const result = new Map<string, ShapePose>()

  const seedIds: string[] = []
  if (newConnection.a.kind === 'shape') seedIds.push(newConnection.a.shapeId)
  if (newConnection.b.kind === 'shape') seedIds.push(newConnection.b.shapeId)
  if (seedIds.length === 0) return result

  const componentIds = getFreeComponentIds(connections, seedIds[0])
  for (const id of seedIds) {
    for (const other of getFreeComponentIds(connections, id)) componentIds.add(other)
  }

  const componentConnections = connections.filter(
    (connection) =>
      connection.a.kind === 'shape' &&
      connection.b.kind === 'shape' &&
      componentIds.has(connection.a.shapeId) &&
      componentIds.has(connection.b.shapeId),
  )
  if (componentConnections.length === 0) return result

  const solved = solveFreeComponentPoses(shapesById, componentIds, componentConnections)
  for (const [id, pose] of poseMapToShapePoses(solved)) {
    const shape = shapesById.get(id)
    if (!shape) continue
    const posDelta = Math.hypot(
      pose.position[0] - shape.position[0],
      pose.position[1] - shape.position[1],
      pose.position[2] - shape.position[2],
    )
    const q0 = new THREE.Quaternion(...shape.quaternion)
    const q1 = new THREE.Quaternion(...pose.quaternion)
    const angle = q0.angleTo(q1)
    if (posDelta < MIN_POSE_DELTA && angle < MIN_ANGLE_DELTA) continue
    result.set(id, pose)
  }

  return result
}

/**
 * Hook-chain BFS distance from the ceiling anchor. Missing / unreachable
 * shapes get Infinity so cluster root selection prefers the nearer member.
 */
function hangingDistanceFromAnchor(
  connections: Connection[],
  shapeId: string,
): number {
  const adjacency = buildAdjacency(connections)
  const dist = new Map<string, number>([['anchor', 0]])
  const queue = ['anchor']
  while (queue.length > 0) {
    const bodyKey = queue.shift()!
    const d = dist.get(bodyKey)!
    for (const { other } of adjacency.get(bodyKey) ?? []) {
      if (other.kind === 'anchor') continue
      const otherKey = endpointBodyKey(other)
      if (dist.has(otherKey)) continue
      dist.set(otherKey, d + 1)
      queue.push(otherKey)
    }
  }
  return dist.get(shapeId) ?? Infinity
}

/**
 * Close residual gaps inside a hanging rigid cycle (e.g. two octahedra tied at
 * two corners). Keeps the cluster member nearest the hook fixed and orients
 * the rest via multi-pin projection so every cycle corner coincides before
 * fixed joints mount. No-op for non-cyclic hanging↔hanging bridges.
 */
export function computeHangingClusterTightenPoses(
  shapes: Shape[],
  connections: Connection[],
  newConnection: Connection,
): Map<string, ShapePose> {
  const result = new Map<string, ShapePose>()
  if (newConnection.a.kind !== 'shape' || newConnection.b.kind !== 'shape') {
    return result
  }

  const clusterIds = getRigidClusterShapeIds(connections, newConnection.a.shapeId)
  if (clusterIds.size < 2) return result
  // New tie must participate in this cluster.
  if (!clusterIds.has(newConnection.b.shapeId)) return result

  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  let rootId: string | null = null
  let rootDist = Infinity
  for (const id of clusterIds) {
    const d = hangingDistanceFromAnchor(connections, id)
    if (d < rootDist) {
      rootDist = d
      rootId = id
    }
  }
  if (!rootId || !shapesById.has(rootId)) return result

  const poses = new Map<string, MutablePose>()
  for (const id of clusterIds) {
    const shape = shapesById.get(id)
    if (shape) poses.set(id, poseFromShape(shape))
  }

  const clusterConnections = connections.filter(
    (connection) =>
      connection.a.kind === 'shape' &&
      connection.b.kind === 'shape' &&
      clusterIds.has(connection.a.shapeId) &&
      clusterIds.has(connection.b.shapeId),
  )

  const resolved = new Set<string>([rootId])
  const queue = [rootId]

  while (queue.length > 0) {
    const bodyKey = queue.shift()!
    // Collect every unresolved neighbor of any resolved member, with all pins
    // to already-resolved shapes, then place once (multi-pin when ≥2).
    const pendingPins = new Map<string, VertexTarget[]>()

    for (const connection of clusterConnections) {
      if (connection.a.kind !== 'shape' || connection.b.kind !== 'shape') continue
      const aId = connection.a.shapeId
      const bId = connection.b.shapeId
      const aResolved = resolved.has(aId)
      const bResolved = resolved.has(bId)
      if (aResolved === bResolved) continue

      const fixedId = aResolved ? aId : bId
      const movingId = aResolved ? bId : aId
      const fixedEnd = aResolved ? connection.a : connection.b
      const movingEnd = aResolved ? connection.b : connection.a
      const fixedShape = shapesById.get(fixedId)
      const fixedPose = poses.get(fixedId)
      if (!fixedShape || !fixedPose) continue

      const target = worldVertexFromPose(fixedPose, fixedShape, fixedEnd.vertexIndex)
      const list = pendingPins.get(movingId) ?? []
      list.push({ vertexIndex: movingEnd.vertexIndex, target })
      pendingPins.set(movingId, list)
    }

    // Prefer placing neighbors of the dequeued node first; fall back to any
    // pending member so multi-edge cycles still progress.
    const order: string[] = []
    for (const connection of clusterConnections) {
      if (connection.a.kind !== 'shape' || connection.b.kind !== 'shape') continue
      const aId = connection.a.shapeId
      const bId = connection.b.shapeId
      if (aId === bodyKey && pendingPins.has(bId) && !order.includes(bId)) order.push(bId)
      if (bId === bodyKey && pendingPins.has(aId) && !order.includes(aId)) order.push(aId)
    }
    for (const id of pendingPins.keys()) {
      if (!order.includes(id)) order.push(id)
    }

    for (const movingId of order) {
      if (resolved.has(movingId)) continue
      const pins = pendingPins.get(movingId)
      const shape = shapesById.get(movingId)
      const pose = poses.get(movingId)
      if (!pins || !shape || !pose) continue

      // Deduplicate by vertex (average if a corner is multi-tied).
      const byVertex = new Map<number, THREE.Vector3[]>()
      for (const pin of pins) {
        const list = byVertex.get(pin.vertexIndex) ?? []
        list.push(pin.target)
        byVertex.set(pin.vertexIndex, list)
      }
      const unique: VertexTarget[] = []
      for (const [vertexIndex, targets] of byVertex) {
        const avg = new THREE.Vector3()
        for (const t of targets) avg.add(t)
        avg.multiplyScalar(1 / targets.length)
        unique.push({ vertexIndex, target: avg })
      }

      projectShapeFromPins(shape, pose, unique, 1)
      resolved.add(movingId)
      queue.push(movingId)
    }

    // Leaf with no unresolved neighbors — keep draining the queue.
  }

  for (const [id, pose] of poseMapToShapePoses(poses)) {
    if (id === rootId) continue
    const shape = shapesById.get(id)
    if (!shape) continue
    const posDelta = Math.hypot(
      pose.position[0] - shape.position[0],
      pose.position[1] - shape.position[1],
      pose.position[2] - shape.position[2],
    )
    const q0 = new THREE.Quaternion(...shape.quaternion)
    const q1 = new THREE.Quaternion(...pose.quaternion)
    const angle = q0.angleTo(q1)
    if (posDelta < MIN_POSE_DELTA && angle < MIN_ANGLE_DELTA) continue
    result.set(id, pose)
  }

  return result
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
 * corner it's tied to. Newly hanging pieces also rotate so the tied corner
 * points up the thread (pendulum-ready) before dynamics take over.
 */
export function computeRestingPoses(
  shapes: Shape[],
  connections: Connection[],
  /**
   * Shape ids whose current transforms are already authoritative (e.g. live
   * hanging bodies). They are walked for BFS but not repositioned.
   */
  fixedShapeIds: ReadonlySet<string> = new Set(),
): Map<string, ShapePose> {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const resolved = new Map<string, ShapePose>()
  const adjacency = buildAdjacency(connections)

  const worldPositionOf = (endpoint: EndpointRef): THREE.Vector3 | null => {
    if (endpoint.kind === 'anchor') return new THREE.Vector3(...ANCHOR_POSITION)
    const shape = shapesById.get(endpoint.shapeId)
    if (!shape) return null
    const pose = resolved.get(shape.id)
    const position = pose?.position ?? shape.position
    const quaternion = pose?.quaternion ?? shape.quaternion
    return localVertex(shape, endpoint.vertexIndex)
      .applyQuaternion(new THREE.Quaternion(...quaternion))
      .add(new THREE.Vector3(...position))
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
        visited.add(otherKey)
        queue.push(otherKey)
        continue
      }

      const targetWorldPos = worldPositionOf(self)
      if (!targetWorldPos) continue

      // Closed constructions (triangles, etc.) move as one rigid piece so
      // hanging from the hook doesn't tear the cluster into separate straws.
      const clusterIds = getRigidClusterShapeIds(connections, other.shapeId)
      if (clusterIds.size > 1) {
        const attachCorner = localVertex(otherShape, other.vertexIndex)
          .applyQuaternion(new THREE.Quaternion(...otherShape.quaternion))
          .add(new THREE.Vector3(...otherShape.position))
        const delta = targetWorldPos.clone().sub(attachCorner)

        for (const memberId of clusterIds) {
          if (visited.has(memberId) || fixedShapeIds.has(memberId)) continue
          const member = shapesById.get(memberId)
          if (!member) continue
          resolved.set(memberId, {
            position: toVector3Tuple(new THREE.Vector3(...member.position).add(delta)),
            quaternion: [...member.quaternion] as QuatTuple,
          })
          visited.add(memberId)
          queue.push(memberId)
        }
        continue
      }

      // Hang-aligned: tied corner points toward the parent attachment.
      const parentHint =
        self.kind === 'anchor'
          ? new THREE.Vector3(0, 1, 0)
          : targetWorldPos.clone().sub(new THREE.Vector3(...otherShape.position))
      const up =
        parentHint.lengthSq() > 1e-8 ? parentHint.normalize() : new THREE.Vector3(0, 1, 0)

      const quaternion = hangQuaternionForVertex(otherShape, other.vertexIndex, up)
      const localOffset = localVertex(otherShape, other.vertexIndex).applyQuaternion(quaternion)
      const newPosition = targetWorldPos.clone().sub(localOffset)

      resolved.set(otherShape.id, {
        position: toVector3Tuple(newPosition),
        quaternion: quatTuple(quaternion),
      })

      visited.add(otherKey)
      queue.push(otherKey)
    }
  }

  return resolved
}

/** Translation-only view of resting poses (tests / legacy callers). */
export function computeRestingPositions(
  shapes: Shape[],
  connections: Connection[],
  fixedShapeIds: ReadonlySet<string> = new Set(),
): Map<string, Vector3Tuple> {
  const poses = computeRestingPoses(shapes, connections, fixedShapeIds)
  const positions = new Map<string, Vector3Tuple>()
  for (const [id, pose] of poses) positions.set(id, pose.position)
  return positions
}

export type { ShapePose, QuatTuple }
