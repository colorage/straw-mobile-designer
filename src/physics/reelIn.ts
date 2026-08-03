import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { getEndpointWorldPosition } from '../scene/endpointPosition'
import { getScaledVertex } from '../state/shapeSpace'
import {
  endpointBodyKey,
  type Connection,
  type EndpointRef,
  type QuatTuple,
  type Shape,
  type ShapePose,
  type ShapeReelIn,
} from '../state/types'

export type { ShapeReelIn, ShapePose }

const MIN_REEL_DISTANCE = 0.02
const MIN_REEL_ANGLE = 0.02

function worldVertexOffset(
  shape: Shape,
  vertexIndex: number,
  quaternion: QuatTuple = shape.quaternion,
): THREE.Vector3 {
  const [x, y, z] = getScaledVertex(shape, vertexIndex)
  return new THREE.Vector3(x, y, z).applyQuaternion(new THREE.Quaternion(...quaternion))
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
  movingQuaternion?: QuatTuple,
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

    const localOffset = worldVertexOffset(
      movingShape,
      self.vertexIndex,
      movingQuaternion ?? movingShape.quaternion,
    )
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

  // When the intended close target is known, reject unrelated neighbors (e.g. a
  // parent hook joint) that would cancel a hang↔hang reel back to "stay put".
  if (preferNear && best) {
    const intended = Math.hypot(
      preferNear[0] - movingShape.position[0],
      preferNear[1] - movingShape.position[1],
      preferNear[2] - movingShape.position[2],
    )
    const maxDrift = Math.max(0.08, intended * 0.75)
    if (bestDist > maxDrift) return null
  }

  return best
}

/** Ease-out cubic: fast start, gentle settle as the thread finishes shortening. */
export function easeOutCubic(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

export function reelDurationMs(from: Vector3Tuple, to: Vector3Tuple, angle = 0): number {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const dist = Math.hypot(dx, dy, dz)
  const spin = Math.abs(angle) * 0.35
  // Long enough to read as a deliberate shorten, scales a bit with gap size.
  return Math.min(1400, Math.max(550, 450 + dist * 140 + spin * 180))
}

export type BuildReelInsOptions = {
  /**
   * Always create a reel entry (min duration) even when the pose gap is below
   * the usual skip thresholds. Used for hanging↔hanging overlap ties so the
   * new joint stays deferred while the thread finishes shortening.
   * Also locks the finish target so live neighbor tracking cannot undo a
   * multi-pin hanging solve.
   */
  force?: boolean
}

/** Build reel-in entries for every shape that still has a meaningful pose gap. */
export function buildReelIns(
  shapes: Shape[],
  targets: Map<string, ShapePose>,
  now = performance.now(),
  options: BuildReelInsOptions = {},
): ShapeReelIn[] {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const reelIns: ShapeReelIn[] = []

  for (const [shapeId, target] of targets) {
    const shape = shapesById.get(shapeId)
    if (!shape) continue
    const from = shape.position
    const to = target.position
    const fromQuat = shape.quaternion
    const toQuat = target.quaternion
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
    const angle = new THREE.Quaternion(...fromQuat).angleTo(new THREE.Quaternion(...toQuat))
    if (!options.force && dist < MIN_REEL_DISTANCE && angle < MIN_REEL_ANGLE) continue
    reelIns.push({
      shapeId,
      from: [...from] as Vector3Tuple,
      to,
      fromQuat: [...fromQuat] as QuatTuple,
      toQuat: [...toQuat] as QuatTuple,
      startedAt: now,
      durationMs: reelDurationMs(from, to, angle),
      lockTarget: options.force || undefined,
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
