import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { getScaledVertex } from '../state/shapeSpace'
import {
  endpointBodyKey,
  type Connection,
  type EndpointRef,
  type Shape,
} from '../state/types'
import { getHangingShapeIds } from './restingLayout'

export type ShapePose = {
  position: Vector3Tuple
  quaternion: [number, number, number, number]
}

type WorkingPose = {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

const ITERATIONS = 64
const LINEAR_GAIN = 0.55
const ANGULAR_GAIN = 0.45
const FOLD_GAIN = 0.35
const MAX_ANGULAR_STEP = 0.35
const CONVERGENCE_EPS = 1e-4
const DEGENERATE_EPS = 1e-8

const _worldA = new THREE.Vector3()
const _worldB = new THREE.Vector3()
const _delta = new THREE.Vector3()
const _r = new THREE.Vector3()
const _torque = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _mid = new THREE.Vector3()
const _qDelta = new THREE.Quaternion()
const _centroid = new THREE.Vector3()
const _origCentroid = new THREE.Vector3()

function worldVertexOffset(
  shape: Shape,
  vertexIndex: number,
  quat: THREE.Quaternion,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const [x, y, z] = getScaledVertex(shape, vertexIndex)
  return out.set(x, y, z).applyQuaternion(quat)
}

function pickPerpendicular(direction: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(direction.x)
  const ay = Math.abs(direction.y)
  const az = Math.abs(direction.z)
  if (ax <= ay && ax <= az) {
    return _axis.set(0, -direction.z, direction.y).normalize()
  }
  if (ay <= az) {
    return _axis.set(-direction.z, 0, direction.x).normalize()
  }
  return _axis.set(-direction.y, direction.x, 0).normalize()
}

function applyAxisAngle(quat: THREE.Quaternion, axis: THREE.Vector3, angle: number) {
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-10) return
  _qDelta.setFromAxisAngle(axis, angle)
  quat.premultiply(_qDelta).normalize()
}

/**
 * Apply a point-constraint correction that moves a body's world corner toward
 * `target`. Linear slide closes most of the gap; angular correction swings the
 * corner when translation alone cannot (cycles / polygons). When the offset and
 * error are collinear the cross product vanishes — fold out of line so later
 * iterations can form a triangle instead of staying stacked.
 */
function applyBodyCorrection(
  pose: WorkingPose,
  shape: Shape,
  vertexIndex: number,
  target: THREE.Vector3,
  weight: number,
) {
  if (weight <= 0) return

  const [lx, ly, lz] = getScaledVertex(shape, vertexIndex)
  _r.set(lx, ly, lz).applyQuaternion(pose.quaternion)
  const cornerX = pose.position.x + _r.x
  const cornerY = pose.position.y + _r.y
  const cornerZ = pose.position.z + _r.z
  _delta.set(target.x - cornerX, target.y - cornerY, target.z - cornerZ)
  const errSq = _delta.lengthSq()
  if (errSq < CONVERGENCE_EPS * CONVERGENCE_EPS) return

  pose.position.addScaledVector(_delta, weight * LINEAR_GAIN)

  _torque.copy(_r).cross(_delta)
  const torqueLenSq = _torque.lengthSq()
  const rLenSq = _r.lengthSq()

  if (torqueLenSq < DEGENERATE_EPS) {
    if (errSq > CONVERGENCE_EPS * CONVERGENCE_EPS && rLenSq > DEGENERATE_EPS) {
      const foldAngle =
        weight * FOLD_GAIN * Math.min(Math.sqrt(errSq) / Math.sqrt(rLenSq), MAX_ANGULAR_STEP)
      applyAxisAngle(pose.quaternion, pickPerpendicular(_r), foldAngle)
    }
    return
  }

  const angle = Math.min(
    (Math.sqrt(torqueLenSq) / Math.max(rLenSq, 1e-8)) * ANGULAR_GAIN * weight,
    MAX_ANGULAR_STEP,
  )
  applyAxisAngle(pose.quaternion, _torque.normalize(), angle)
}

/** Undirected adjacency over free shape ids only. */
function buildFreeAdjacency(
  connections: Connection[],
  hanging: ReadonlySet<string>,
): Map<string, { self: EndpointRef; other: EndpointRef }[]> {
  const adjacency = new Map<string, { self: EndpointRef; other: EndpointRef }[]>()
  const addEdge = (self: EndpointRef, other: EndpointRef) => {
    if (self.kind === 'anchor' || other.kind === 'anchor') return
    if (hanging.has(self.shapeId) || hanging.has(other.shapeId)) return
    const list = adjacency.get(self.shapeId) ?? []
    list.push({ self, other })
    adjacency.set(self.shapeId, list)
  }
  for (const connection of connections) {
    addEdge(connection.a, connection.b)
    addEdge(connection.b, connection.a)
  }
  return adjacency
}

/**
 * Free shapes reachable from `seeds` through free↔free ties (excludes anything
 * already on the hook chain).
 */
export function getFreeClusterShapeIds(
  connections: Connection[],
  seeds: Iterable<string>,
  hanging: ReadonlySet<string> = getHangingShapeIds(connections),
): Set<string> {
  const adjacency = buildFreeAdjacency(connections, hanging)
  const cluster = new Set<string>()
  const queue: string[] = []

  for (const id of seeds) {
    if (hanging.has(id) || cluster.has(id)) continue
    cluster.add(id)
    queue.push(id)
  }

  while (queue.length > 0) {
    const id = queue.shift()!
    for (const { other } of adjacency.get(id) ?? []) {
      if (other.kind === 'anchor') continue
      if (cluster.has(other.shapeId) || hanging.has(other.shapeId)) continue
      cluster.add(other.shapeId)
      queue.push(other.shapeId)
    }
  }

  return cluster
}

/**
 * Target translation that brings `moving`'s corner onto `fixed`'s corner.
 * Used when the free cluster has only a single joint (no polygon to form).
 */
function simpleCloseTarget(
  shapesById: Map<string, Shape>,
  connection: Connection,
): Map<string, ShapePose> {
  let fixed = connection.a
  let moving = connection.b

  if (moving.kind === 'anchor') {
    fixed = connection.b
    moving = connection.a
  }
  if (moving.kind === 'anchor') return new Map()
  if (fixed.kind === 'shape' && fixed.shapeId === moving.shapeId) return new Map()

  const movingShape = shapesById.get(moving.shapeId)
  if (!movingShape) return new Map()
  if (fixed.kind === 'anchor') return new Map()

  const fixedShape = shapesById.get(fixed.shapeId)
  if (!fixedShape) return new Map()

  const fixedQuat = new THREE.Quaternion(...fixedShape.quaternion)
  const movingQuat = new THREE.Quaternion(...movingShape.quaternion)
  const targetCorner = worldVertexOffset(fixedShape, fixed.vertexIndex, fixedQuat).add(
    new THREE.Vector3(...fixedShape.position),
  )
  const localOffset = worldVertexOffset(movingShape, moving.vertexIndex, movingQuat)
  const newPosition = targetCorner.sub(localOffset)

  return new Map([
    [
      movingShape.id,
      {
        position: [newPosition.x, newPosition.y, newPosition.z],
        quaternion: [...movingShape.quaternion] as [number, number, number, number],
      },
    ],
  ])
}

function clusterCentroid(poses: Iterable<WorkingPose>, out: THREE.Vector3): THREE.Vector3 {
  out.set(0, 0, 0)
  let count = 0
  for (const pose of poses) {
    out.add(pose.position)
    count += 1
  }
  if (count > 0) out.multiplyScalar(1 / count)
  return out
}

/**
 * Solve positions + orientations for a free (not-yet-hanging) cluster so every
 * thread joint's corners coincide. A single free↔free tie still just slides one
 * shape; cycles (e.g. three straws) rotate into a tightened polygon.
 *
 * The cluster's centroid is preserved so the assembly does not jump across the
 * workbench. The newly clicked link biases motion toward the second endpoint so
 * the first-clicked corner feels more planted.
 */
export function computeFreeClusterLayout(
  shapes: Shape[],
  connections: Connection[],
  trigger: Connection,
): Map<string, ShapePose> {
  const hanging = getHangingShapeIds(connections)
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))

  const seeds: string[] = []
  if (trigger.a.kind === 'shape' && !hanging.has(trigger.a.shapeId)) seeds.push(trigger.a.shapeId)
  if (trigger.b.kind === 'shape' && !hanging.has(trigger.b.shapeId)) seeds.push(trigger.b.shapeId)
  if (seeds.length === 0) return new Map()

  const clusterIds = getFreeClusterShapeIds(connections, seeds, hanging)
  if (clusterIds.size === 0) return new Map()

  const clusterConnections = connections.filter((connection) => {
    const a = endpointBodyKey(connection.a)
    const b = endpointBodyKey(connection.b)
    return a !== 'anchor' && b !== 'anchor' && clusterIds.has(a) && clusterIds.has(b)
  })

  if (clusterConnections.length <= 1) {
    return simpleCloseTarget(shapesById, trigger)
  }

  const poses = new Map<string, WorkingPose>()
  for (const id of clusterIds) {
    const shape = shapesById.get(id)
    if (!shape) continue
    poses.set(id, {
      position: new THREE.Vector3(...shape.position),
      quaternion: new THREE.Quaternion(...shape.quaternion),
    })
  }

  clusterCentroid(poses.values(), _origCentroid)

  // Soft pin: first-clicked endpoint of the new link resists motion more.
  const fixedKey =
    trigger.a.kind === 'shape' && clusterIds.has(trigger.a.shapeId)
      ? trigger.a.shapeId
      : trigger.b.kind === 'shape'
        ? trigger.b.shapeId
        : null
  const movingKey =
    trigger.b.kind === 'shape' && trigger.b.shapeId !== fixedKey
      ? trigger.b.shapeId
      : trigger.a.kind === 'shape' && trigger.a.shapeId !== fixedKey
        ? trigger.a.shapeId
        : null

  for (let iter = 0; iter < ITERATIONS; iter++) {
    let maxError = 0

    for (const connection of clusterConnections) {
      if (connection.a.kind !== 'shape' || connection.b.kind !== 'shape') continue
      const shapeA = shapesById.get(connection.a.shapeId)
      const shapeB = shapesById.get(connection.b.shapeId)
      const poseA = poses.get(connection.a.shapeId)
      const poseB = poses.get(connection.b.shapeId)
      if (!shapeA || !shapeB || !poseA || !poseB) continue

      const [ax, ay, az] = getScaledVertex(shapeA, connection.a.vertexIndex)
      const [bx, by, bz] = getScaledVertex(shapeB, connection.b.vertexIndex)
      _worldA
        .set(ax, ay, az)
        .applyQuaternion(poseA.quaternion)
        .add(poseA.position)
      _worldB
        .set(bx, by, bz)
        .applyQuaternion(poseB.quaternion)
        .add(poseB.position)

      _delta.copy(_worldB).sub(_worldA)
      maxError = Math.max(maxError, _delta.length())
      _mid.copy(_worldA).add(_worldB).multiplyScalar(0.5)

      let weightA = 0.5
      let weightB = 0.5
      if (connection.a.shapeId === fixedKey && connection.b.shapeId === movingKey) {
        weightA = 0.2
        weightB = 0.8
      } else if (connection.b.shapeId === fixedKey && connection.a.shapeId === movingKey) {
        weightA = 0.8
        weightB = 0.2
      } else if (connection.a.shapeId === fixedKey) {
        weightA = 0.3
        weightB = 0.7
      } else if (connection.b.shapeId === fixedKey) {
        weightA = 0.7
        weightB = 0.3
      }

      // Snapshot mid before either body moves.
      const midX = _mid.x
      const midY = _mid.y
      const midZ = _mid.z
      applyBodyCorrection(poseA, shapeA, connection.a.vertexIndex, _mid.set(midX, midY, midZ), weightA)
      applyBodyCorrection(poseB, shapeB, connection.b.vertexIndex, _mid.set(midX, midY, midZ), weightB)
    }

    if (maxError < CONVERGENCE_EPS) break
  }

  // Preserve workbench placement: undo net centroid drift from the projections.
  clusterCentroid(poses.values(), _centroid)
  const driftX = _origCentroid.x - _centroid.x
  const driftY = _origCentroid.y - _centroid.y
  const driftZ = _origCentroid.z - _centroid.z
  for (const pose of poses.values()) {
    pose.position.x += driftX
    pose.position.y += driftY
    pose.position.z += driftZ
  }

  const result = new Map<string, ShapePose>()
  for (const [id, pose] of poses) {
    const shape = shapesById.get(id)
    if (!shape) continue
    result.set(id, {
      position: [pose.position.x, pose.position.y, pose.position.z],
      quaternion: [pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w],
    })
  }
  return result
}
