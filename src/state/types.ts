import type { Edge, ShapeKind, Vector3Tuple } from '../geometry/primitives'

export type StrawSize = 1 | 0.5 | 0.25

export const STRAW_SIZES: StrawSize[] = [1, 0.5, 0.25]

export const STRAW_SIZE_LABELS: Record<StrawSize, string> = {
  1: '1',
  0.5: '1/2',
  0.25: '1/4',
}

export interface Shape {
  id: string
  kind: ShapeKind
  size: StrawSize
  /** Local-space rest vertices (unit-edge space, before size/world scaling). */
  vertices: Vector3Tuple[]
  edges: Edge[]
  /** World transform (workbench pose while free; last synced pose while hanging). */
  position: Vector3Tuple
  quaternion: [number, number, number, number]
}

export type EndpointRef =
  | { kind: 'shape'; shapeId: string; vertexIndex: number }
  | { kind: 'anchor' }

export interface Connection {
  id: string
  a: EndpointRef
  b: EndpointRef
}

/** Transient animation pulling a shape along a new thread until corners meet. */
export interface ShapeReelIn {
  shapeId: string
  from: Vector3Tuple
  to: Vector3Tuple
  fromQuat: [number, number, number, number]
  toQuat: [number, number, number, number]
  startedAt: number
  durationMs: number
}

export interface StrawCounts {
  bySize: Record<StrawSize, number>
  total: number
}

export function endpointsEqual(a: EndpointRef, b: EndpointRef): boolean {
  if (a.kind === 'anchor' || b.kind === 'anchor') return a.kind === b.kind
  return a.shapeId === b.shapeId && a.vertexIndex === b.vertexIndex
}

/** Key identifying the rigid body a given endpoint lives on ('anchor' or a shape id). */
export function endpointBodyKey(endpoint: EndpointRef): string {
  return endpoint.kind === 'anchor' ? 'anchor' : endpoint.shapeId
}

/** Key identifying one specific vertex, used to test "is this corner connected". */
export function endpointVertexKey(endpoint: EndpointRef): string {
  return endpoint.kind === 'anchor' ? 'anchor' : `${endpoint.shapeId}:${endpoint.vertexIndex}`
}
