import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
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

/**
 * The current design (shapes, thread connections, and enough bookkeeping to
 * keep adding to it sensibly) is auto-saved to localStorage on every change,
 * so reloading the page — or closing and reopening the tab later — picks up
 * right where things were left off. Only the durable design lives here;
 * transient UI state (which mode you're in, what's mid-click) intentionally
 * always starts fresh, see `partialize` below.
 */
const PERSISTED_STORAGE_KEY = 'straw-mobile-designer/project'
const PERSISTED_STORAGE_VERSION = 1

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

  addShape: (kind: ShapeKind, position?: Vector3Tuple) => string
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

/** The subset of state that's worth remembering between visits. */
type PersistedMobileState = Pick<StrawMobileState, 'shapes' | 'connections' | 'strawSize' | 'placedCount'>

export const useStrawMobileStore = create<StrawMobileState>()(
  persist(
    (set, get) => ({
      shapes: [],
      connections: [],
      mode: 'build',
      strawSize: 1,
      pendingVertex: null,
      placedCount: 0,
      selectedShapeId: null,

      addShape: (kind, position) => {
        const { vertices, edges } = PRIMITIVE_GENERATORS[kind]()
        const { strawSize, placedCount } = get()
        const id = createId()
        const placedAt = position ?? nextWorkbenchPosition(placedCount)
        const shape: Shape = {
          id,
          kind,
          size: strawSize,
          vertices,
          edges,
          position: placedAt,
          quaternion: [0, 0, 0, 1],
        }
        set((state) => ({
          shapes: [...state.shapes, shape],
          placedCount: state.placedCount + 1,
          // Drop-placed shapes get selected so the gizmo appears immediately;
          // click-to-add (no position) keeps clearing selection as before.
          selectedShapeId: position !== undefined ? id : null,
        }))
        return id
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

      moveShape: (id, position) =>
        set((state) => ({
          shapes: state.shapes.map((shape) => (shape.id === id ? { ...shape, position } : shape)),
        })),

      selectShape: (id) => set({ selectedShapeId: id }),

      reset: () => {
        for (const shape of get().shapes) clearBodyRef(shape.id)
        set({
          shapes: [],
          connections: [],
          mode: 'build',
          pendingVertex: null,
          placedCount: 0,
          selectedShapeId: null,
        })
      },

      getStrawCounts: () => computeStrawCounts(get().shapes),
    }),
    {
      name: PERSISTED_STORAGE_KEY,
      version: PERSISTED_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Mode and click-in-progress state are transient UI concerns, not part
      // of the saved design — a reload always lands back in build mode,
      // never mid-simulation with no physics bodies to show for it.
      partialize: (state): PersistedMobileState => ({
        shapes: state.shapes,
        connections: state.connections,
        strawSize: state.strawSize,
        placedCount: state.placedCount,
      }),
    },
  ),
)
