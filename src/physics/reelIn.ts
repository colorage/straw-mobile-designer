import type { Vector3Tuple } from '../geometry/primitives'
import {
  endpointBodyKey,
  type Connection,
  type Shape,
  type ShapeReelIn,
} from '../state/types'
import type { ShapePose } from './freeClusterLayout'

export type { ShapeReelIn }

const MIN_REEL_DISTANCE = 0.02
const MIN_REEL_ANGLE = 0.02

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

function quatAngle(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
  return 2 * Math.acos(Math.min(1, Math.max(0, dot)))
}

/** Convert translation-only targets (hanging BFS) into full pose targets. */
export function posesFromPositions(
  shapes: Shape[],
  positions: Map<string, Vector3Tuple>,
): Map<string, ShapePose> {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const poses = new Map<string, ShapePose>()
  for (const [shapeId, position] of positions) {
    const shape = shapesById.get(shapeId)
    if (!shape) continue
    poses.set(shapeId, {
      position,
      quaternion: [...shape.quaternion] as [number, number, number, number],
    })
  }
  return poses
}

/** Build reel-in entries for every shape that still has a meaningful gap or spin to close. */
export function buildReelIns(
  shapes: Shape[],
  targets: Map<string, ShapePose>,
  now = performance.now(),
): ShapeReelIn[] {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const reelIns: ShapeReelIn[] = []

  for (const [shapeId, pose] of targets) {
    const shape = shapesById.get(shapeId)
    if (!shape) continue
    const from = shape.position
    const to = pose.position
    const fromQuat = [...shape.quaternion] as [number, number, number, number]
    const toQuat = pose.quaternion
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
    const angle = quatAngle(fromQuat, toQuat)
    if (dist < MIN_REEL_DISTANCE && angle < MIN_REEL_ANGLE) continue
    reelIns.push({
      shapeId,
      from: [...from] as Vector3Tuple,
      to,
      fromQuat,
      toQuat,
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
