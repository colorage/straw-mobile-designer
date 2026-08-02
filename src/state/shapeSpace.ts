import type { Vector3Tuple } from '../geometry/primitives'
import type { Shape } from './types'

export const BASE_STRAW_LENGTH = 1.4
export const ANCHOR_POSITION: Vector3Tuple = [0, 4.5, 0]

/** A shape's vertex, scaled from unit-edge local space into world-scale local space. */
export function getScaledVertex(shape: Shape, vertexIndex: number): Vector3Tuple {
  const scale = shape.size * BASE_STRAW_LENGTH
  const [x, y, z] = shape.vertices[vertexIndex]
  return [x * scale, y * scale, z * scale]
}
