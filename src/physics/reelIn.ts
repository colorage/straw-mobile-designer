import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { getEndpointWorldPosition } from '../scene/endpointPosition'
import { ANCHOR_POSITION, getScaledVertex } from '../state/shapeSpace'
import {
  endpointBodyKey,
  type Connection,
  type EndpointRef,
  type Shape,
  type ShapeReelIn,
} from '../state/types'

export type { ShapeReelIn }

const MIN_REEL_DISTANCE = 0.02

function worldVertexOffset(shape: Shape, vertexIndex: number): THREE.Vector3 {
  const [x, y, z] = getScaledVertex(shape, vertexIndex)
  return new THREE.Vector3(x, y, z).applyQuaternion(new THREE.Quaternion(...shape.quaternion))
}

function endpointWorldPosition(
  endpoint: EndpointRef,
  shapesById: Map<string, Shape>,
): THREE.Vector3 | null {
  if (endpoint.kind === 'anchor') return new THREE.Vector3(...ANCHOR_POSITION)
  const shape = shapesById.get(endpoint.shapeId)
  if (!shape) return null
  return worldVertexOffset(shape, endpoint.vertexIndex).add(new THREE.Vector3(...shape.position))
}

/**
 * Body translation that puts `shapeId`'s tied corner onto a live neighbor that
 * is not currently reeling (hanging hub / anchor). Used so reel-in tracks a
 * swinging chain instead of finishing on a stale workbench snapshot.
 */
export function computeLiveReelClosePosition(
  shapeId: string,
  shapes: Shape[],
  connections: Connection[],
  reelingIds: ReadonlySet<string>,
  preferNear?: Vector3Tuple,
): Vector3Tuple | null {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const movingShape = shapesById.get(shapeId)
  if (!movingShape) return null

  let best: Vector3Tuple | null = null
  let bestDist = Infinity

  for (const connection of connections) {
    let self: EndpointRef | null = null
    let other: EndpointRef | null = null
    if (connection.a.kind === 'shape' && connection.a.shapeId === shapeId) {
      self = connection.a
      other = connection.b
    } else if (connection.b.kind === 'shape' && connection.b.shapeId === shapeId) {
      self = connection.b
      other = connection.a
    }
    if (!self || !other || self.kind !== 'shape') continue

    const otherKey = endpointBodyKey(other)
    if (otherKey !== 'anchor' && reelingIds.has(otherKey)) continue

    const targetCorner = getEndpointWorldPosition(other, shapesById)
    if (!targetCorner) continue

    const localOffset = worldVertexOffset(movingShape, self.vertexIndex)
    const position: Vector3Tuple = [
      targetCorner.x - localOffset.x,
      targetCorner.y - localOffset.y,
      targetCorner.z - localOffset.z,
    ]

    if (!preferNear) return position
    const dist = Math.hypot(
      position[0] - preferNear[0],
      position[1] - preferNear[1],
      position[2] - preferNear[2],
    )
    if (dist < bestDist) {
      bestDist = dist
      best = position
    }
  }

  return best
}

/** Ease-out cubic: fast start, gentle settle as the thread finishes shortening. */
export function easeOutCubic(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

export function reelDurationMs(from: Vector3Tuple, to: Vector3Tuple): number {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const dist = Math.hypot(dx, dy, dz)
  // Long enough to read as a deliberate shorten, scales a bit with gap size.
  return Math.min(1400, Math.max(550, 450 + dist * 140))
}

/**
 * Target translation that brings `moving`'s corner onto `fixed`'s corner.
 * Used for free↔free ties (no hook chain involved yet).
 */
export function computeFreeCloseTarget(
  shapes: Shape[],
  connection: Connection,
): Map<string, Vector3Tuple> {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  let fixed = connection.a
  let moving = connection.b

  if (moving.kind === 'anchor') {
    fixed = connection.b
    moving = connection.a
  }

  if (moving.kind === 'anchor') return new Map()
  if (fixed.kind === 'shape' && fixed.shapeId === moving.shapeId) return new Map()

  const movingShape = shapesById.get(moving.shapeId)
  const targetCorner = endpointWorldPosition(fixed, shapesById)
  if (!movingShape || !targetCorner) return new Map()

  const localOffset = worldVertexOffset(movingShape, moving.vertexIndex)
  const newPosition = targetCorner.clone().sub(localOffset)
  return new Map([[movingShape.id, [newPosition.x, newPosition.y, newPosition.z]]])
}

/** Build reel-in entries for every shape that still has a meaningful gap to close. */
export function buildReelIns(
  shapes: Shape[],
  targets: Map<string, Vector3Tuple>,
  now = performance.now(),
): ShapeReelIn[] {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const reelIns: ShapeReelIn[] = []

  for (const [shapeId, to] of targets) {
    const shape = shapesById.get(shapeId)
    if (!shape) continue
    const from = shape.position
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
    if (dist < MIN_REEL_DISTANCE) continue
    reelIns.push({
      shapeId,
      from: [...from] as Vector3Tuple,
      to,
      startedAt: now,
      durationMs: reelDurationMs(from, to),
    })
  }

  return reelIns
}

export function reelInBodyKeys(reelIns: ShapeReelIn[] | undefined | null): Set<string> {
  return new Set((reelIns ?? []).map((reel) => reel.shapeId))
}

export function connectionInvolvesReelIn(
  connection: Connection,
  reelingIds: ReadonlySet<string>,
): boolean {
  const a = endpointBodyKey(connection.a)
  const b = endpointBodyKey(connection.b)
  return (a !== 'anchor' && reelingIds.has(a)) || (b !== 'anchor' && reelingIds.has(b))
}
