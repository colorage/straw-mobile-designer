import type { Edge, ShapeKind, Vector3Tuple } from '../geometry/primitives'

export type StrawSize = 1 | 0.5 | 0.25

export const STRAW_SIZES: StrawSize[] = [1, 0.5, 0.25]

export const STRAW_SIZE_LABELS: Record<StrawSize, string> = {
  1: '1',
  0.5: '1/2',
  0.25: '1/4',
}

export const DEFAULT_PROJECT_NAME = 'project 1'

export type QuatTuple = [number, number, number, number]

export interface Shape {
  id: string
  kind: ShapeKind
  size: StrawSize
  /** Local-space rest vertices (unit-edge space, before size/world scaling). */
  vertices: Vector3Tuple[]
  edges: Edge[]
  /** World transform (workbench pose while free; last synced pose while hanging). */
  position: Vector3Tuple
  quaternion: QuatTuple
}

export type EndpointRef =
  | { kind: 'shape'; shapeId: string; vertexIndex: number }
  | { kind: 'anchor' }

export interface Connection {
  id: string
  a: EndpointRef
  b: EndpointRef
}

/** Transient dwell suggestion while two free corners overlap. */
export interface OverlapSuggest {
  a: EndpointRef
  b: EndpointRef
  startedAt: number
}

/** Session-only HUD status while the overlap proximity scanner is awake. */
export interface OverlapScanUi {
  /** True while scanning (not idle-asleep / gated off). */
  active: boolean
  /** Auto-ties completed during the current wake cycle. */
  connectionsFound: number
  /** Remaining idle fraction until sleep: 1 = just woke / pair found, 0 = about to sleep. */
  sleepProgress: number
}

/** Solved world pose for a shape (reel-in target or resting layout). */
export interface ShapePose {
  position: Vector3Tuple
  quaternion: QuatTuple
}

/** Transient animation pulling shapes along a new thread until corners meet. */
export interface ShapeReelIn {
  shapeId: string
  from: Vector3Tuple
  to: Vector3Tuple
  fromQuat: QuatTuple
  toQuat: QuatTuple
  startedAt: number
  durationMs: number
  /**
   * Hanging multi-pin close: slerp toward `toQuat` while pinning an existing
   * attachment to its live neighbor (parent joints stay mounted). Only the new
   * connection id is deferred via `deferredConnectionIds`.
   */
  lockTarget?: boolean
}

export interface StrawCounts {
  bySize: Record<StrawSize, number>
  total: number
}

/** Index of a selection buffer slot (toolbar buttons 1 / 2 / 3). */
export type SlotIndex = 0 | 1 | 2

/** Deep-cloned shapes + internal threads held in a buffer slot. */
export type SlotBuffer = {
  shapes: Shape[]
  connections: Connection[]
}

/** Fixed toolbar slot tuple used by the draft and gallery project snapshots. */
export type SlotBuffers = [SlotBuffer | null, SlotBuffer | null, SlotBuffer | null]

export const EMPTY_SLOTS: SlotBuffers = [null, null, null]

/** Normalize a persisted slots array into a fixed 3-tuple (legacy / corrupt safe). */
export function normalizeSlots(value: unknown): SlotBuffers {
  if (!Array.isArray(value)) return [...EMPTY_SLOTS]
  return [value[0] ?? null, value[1] ?? null, value[2] ?? null]
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
