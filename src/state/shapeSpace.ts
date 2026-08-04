import type { Vector3Tuple } from '../geometry/primitives'
import type { Shape } from './types'

export const BASE_STRAW_LENGTH = 1.4
/** Default ceiling-hook height before clearance-driven lift. */
export const BASE_ANCHOR_Y = 4.5
export const BASE_ANCHOR_POSITION: Vector3Tuple = [0, BASE_ANCHOR_Y, 0]
/** Alias for the base hook pose — live height lives in `store.anchorY`. */
export const ANCHOR_POSITION = BASE_ANCHOR_POSITION

/** A shape's vertex, scaled from unit-edge local space into world-scale local space. */
export function getScaledVertex(shape: Shape, vertexIndex: number): Vector3Tuple {
  const scale = shape.size * BASE_STRAW_LENGTH
  const [x, y, z] = shape.vertices[vertexIndex]
  return [x * scale, y * scale, z * scale]
}
