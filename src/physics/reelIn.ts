import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import {
  endpointBodyKey,
  type Connection,
  type QuatTuple,
  type Shape,
  type ShapePose,
  type ShapeReelIn,
} from '../state/types'

export type { ShapeReelIn, ShapePose }

const MIN_REEL_DISTANCE = 0.02
const MIN_REEL_ANGLE = 0.02

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

/** Build reel-in entries for every shape that still has a meaningful pose gap. */
export function buildReelIns(
  shapes: Shape[],
  targets: Map<string, ShapePose>,
  now = performance.now(),
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
    if (dist < MIN_REEL_DISTANCE && angle < MIN_REEL_ANGLE) continue
    reelIns.push({
      shapeId,
      from: [...from] as Vector3Tuple,
      to,
      fromQuat: [...fromQuat] as QuatTuple,
      toQuat: [...toQuat] as QuatTuple,
      startedAt: now,
      durationMs: reelDurationMs(from, to, angle),
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
