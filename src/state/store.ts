import { create } from 'zustand'
import { PRIMITIVE_GENERATORS, type ShapeKind, type Vector3Tuple } from '../geometry/primitives'
import { clearBodyRef } from '../physics/bodyRefRegistry'
import {
  endpointsEqual,
  STRAW_SIZES,
  type AppMode,
  type Connection,
  type EndpointRef,
  type Shape,
  type StrawCounts,
  type StrawSize,
} from './types'

export const BASE_STRAW_LENGTH = 1.4
export const ANCHOR_POSITION: Vector3Tuple = [0, 4.5, 0]

const WORKBENCH_COLUMNS = 5
const WORKBENCH_SPACING_X = 2.4
const WORKBENCH_SPACING_Y = 2.2
const WORKBENCH_BASE_Y = 1.2

function nextWorkbenchPosition(slot: number): Vector3Tuple {
  const col = slot % WORKBENCH_COLUMNS
  const row = Math.floor(slot / WORKBENCH_COLUMNS)
  return [
    (col - (WORKBENCH_COLUMNS - 1) / 2) * WORKBENCH_SPACING_X,
    WORKBENCH_BASE_Y + row * WORKBENCH_SPACING_Y,
    0,
  ]
}

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

/** A shape's vertex, scaled from unit-edge local space into world-scale local space. */
export function getScaledVertex(shape: Shape, vertexIndex: number): Vector3Tuple {
  const scale = shape.size * BASE_STRAW_LENGTH
  const [x, y, z] = shape.vertices[vertexIndex]
  return [x * scale, y * scale, z * scale]
}

export function computeStrawCounts(shapes: Shape[]): StrawCounts {
  const bySize: Record<StrawSize, number> = { 1: 0, 0.5: 0, 0.25: 0 }
  for (const shape of shapes) {
    bySize[shape.size] += shape.edges.length
  }
  return {
    bySize,
    total: STRAW_SIZES.reduce((sum, size) => sum + bySize[size], 0),
  }
}

interface StrawMobileState {
  shapes: Shape[]
  connections: Connection[]
  mode: AppMode
  strawSize: StrawSize
  pendingVertex: EndpointRef | null
  placedCount: number
  /** The shape currently picked up for dragging in build mode, if any. */
  selectedShapeId: string | null

  addShape: (kind: ShapeKind) => void
  removeShape: (id: string) => void
  setStrawSize: (size: StrawSize) => void
  selectVertex: (endpoint: EndpointRef) => void
  clearPendingVertex: () => void
  removeConnection: (id: string) => void
  setMode: (mode: AppMode) => void
  setShapeTransform: (id: string, position: Vector3Tuple, quaternion: [number, number, number, number]) => void
  moveShape: (id: string, position: Vector3Tuple) => void
  selectShape: (id: string | null) => void
  reset: () => void
  getStrawCounts: () => StrawCounts
}

export const useStrawMobileStore = create<StrawMobileState>((set, get) => ({
  shapes: [],
  connections: [],
  mode: 'build',
  strawSize: 1,
  pendingVertex: null,
  placedCount: 0,
  selectedShapeId: null,

  addShape: (kind) => {
    const { vertices, edges } = PRIMITIVE_GENERATORS[kind]()
    const { strawSize, placedCount } = get()
    const shape: Shape = {
      id: createId(),
      kind,
      size: strawSize,
      vertices,
      edges,
      position: nextWorkbenchPosition(placedCount),
      quaternion: [0, 0, 0, 1],
    }
    set((state) => ({
      shapes: [...state.shapes, shape],
      placedCount: state.placedCount + 1,
      selectedShapeId: null,
    }))
  },

  removeShape: (id) => {
    clearBodyRef(id)
    set((state) => ({
      shapes: state.shapes.filter((shape) => shape.id !== id),
      connections: state.connections.filter(
        (connection) =>
          !(connection.a.kind === 'shape' && connection.a.shapeId === id) &&
          !(connection.b.kind === 'shape' && connection.b.shapeId === id),
      ),
      pendingVertex:
        state.pendingVertex?.kind === 'shape' && state.pendingVertex.shapeId === id
          ? null
          : state.pendingVertex,
      selectedShapeId: state.selectedShapeId === id ? null : state.selectedShapeId,
    }))
  },

  setStrawSize: (size) => set({ strawSize: size }),

  selectVertex: (endpoint) => {
    const { pendingVertex, connections } = get()
    // Picking a corner to tie thread is a distinct interaction from dragging a
    // shape around; clear any active drag selection so its gizmo doesn't
    // linger over (and steal clicks from) the corner handles.
    set({ selectedShapeId: null })

    if (!pendingVertex) {
      set({ pendingVertex: endpoint })
      return
    }

    if (endpointsEqual(pendingVertex, endpoint)) {
      set({ pendingVertex: null })
      return
    }

    const alreadyConnected = connections.some(
      (connection) =>
        (endpointsEqual(connection.a, pendingVertex) && endpointsEqual(connection.b, endpoint)) ||
        (endpointsEqual(connection.a, endpoint) && endpointsEqual(connection.b, pendingVertex)),
    )

    if (alreadyConnected) {
      set({ pendingVertex: null })
      return
    }

    const connection: Connection = {
      id: createId(),
      a: pendingVertex,
      b: endpoint,
    }
    set((state) => ({ connections: [...state.connections, connection], pendingVertex: null }))
  },

  clearPendingVertex: () => set({ pendingVertex: null }),

  removeConnection: (id) =>
    set((state) => ({
      connections: state.connections.filter((connection) => connection.id !== id),
    })),

  setMode: (mode) => set({ mode, pendingVertex: null, selectedShapeId: null }),

  setShapeTransform: (id, position, quaternion) =>
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        shape.id === id ? { ...shape, position, quaternion } : shape,
      ),
    })),

  reset: () => {
    for (const shape of get().shapes) clearBodyRef(shape.id)
    set({
      shapes: [],
      connections: [],
      mode: 'build',
      pendingVertex: null,
      placedCount: 0,
    })
  },

  getStrawCounts: () => computeStrawCounts(get().shapes),
}))
