import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { PRIMITIVE_GENERATORS, type ShapeKind, type Vector3Tuple } from '../geometry/primitives'
import { clearBodyRef, getBodyRef } from '../physics/bodyRefRegistry'
import { buildReelIns, computeFreeCloseTarget } from '../physics/reelIn'
import { computeRestingPositions, getHangingShapeIds } from '../physics/restingLayout'
import {
  endpointsEqual,
  STRAW_SIZES,
  type Connection,
  type EndpointRef,
  type Shape,
  type ShapeReelIn,
  type StrawCounts,
  type StrawSize,
} from './types'

export { ANCHOR_POSITION, BASE_STRAW_LENGTH, getScaledVertex } from './shapeSpace'

/**
 * The current design (shapes, thread connections, and enough bookkeeping to
 * keep adding to it sensibly) is auto-saved to localStorage on every change,
 * so reloading the page — or closing and reopening the tab later — picks up
 * right where things were left off. Only the durable design lives here;
 * transient UI state (what's mid-click / selected / reeling) intentionally
 * always starts fresh, see `partialize` below.
 */
const PERSISTED_STORAGE_KEY = 'straw-mobile-designer/project'
const PERSISTED_STORAGE_VERSION = 1

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

/** Return shapes with any that leave the hanging chain frozen at their live pose. */
function withSyncedLeavingHanging(
  shapes: Shape[],
  previous: Set<string>,
  next: Set<string>,
): Shape[] {
  let changed = false
  const updated = shapes.map((shape) => {
    if (!previous.has(shape.id) || next.has(shape.id)) return shape
    const body = getBodyRef(shape.id).current
    if (!body) return shape
    const t = body.translation()
    const r = body.rotation()
    changed = true
    return {
      ...shape,
      position: [t.x, t.y, t.z] as Vector3Tuple,
      quaternion: [r.x, r.y, r.z, r.w] as [number, number, number, number],
    }
  })
  return changed ? updated : shapes
}

interface StrawMobileState {
  shapes: Shape[]
  connections: Connection[]
  strawSize: StrawSize
  pendingVertex: EndpointRef | null
  placedCount: number
  /** The free shape currently picked up for dragging, if any. */
  selectedShapeId: string | null
  /** In-progress thread shorten animations (not persisted). */
  reelIns: ShapeReelIn[]

  addShape: (kind: ShapeKind) => void
  removeShape: (id: string) => void
  setStrawSize: (size: StrawSize) => void
  selectVertex: (endpoint: EndpointRef) => void
  clearPendingVertex: () => void
  removeConnection: (id: string) => void
  setShapeTransform: (id: string, position: Vector3Tuple, quaternion: [number, number, number, number]) => void
  moveShape: (id: string, position: Vector3Tuple) => void
  selectShape: (id: string | null) => void
  finishReelIns: (completed: { shapeId: string; position: Vector3Tuple }[]) => void
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
      strawSize: 1,
      pendingVertex: null,
      placedCount: 0,
      selectedShapeId: null,
      reelIns: [],

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
        const { connections, shapes, selectedShapeId, pendingVertex, reelIns } = get()
        const previousHanging = getHangingShapeIds(connections)
        const nextConnections = connections.filter(
          (connection) =>
            !(connection.a.kind === 'shape' && connection.a.shapeId === id) &&
            !(connection.b.kind === 'shape' && connection.b.shapeId === id),
        )
        const nextHanging = getHangingShapeIds(nextConnections)
        const syncedShapes = withSyncedLeavingHanging(shapes, previousHanging, nextHanging)

        clearBodyRef(id)
        set({
          shapes: syncedShapes.filter((shape) => shape.id !== id),
          connections: nextConnections,
          reelIns: reelIns.filter((reel) => reel.shapeId !== id),
          pendingVertex:
            pendingVertex?.kind === 'shape' && pendingVertex.shapeId === id ? null : pendingVertex,
          selectedShapeId: selectedShapeId === id ? null : selectedShapeId,
        })
      },

      setStrawSize: (size) => set({ strawSize: size }),

      selectVertex: (endpoint) => {
        const { pendingVertex, connections, shapes, selectedShapeId } = get()
        // Picking a corner to tie thread is a distinct interaction from dragging a
        // shape around; clear any active drag selection so its gizmo doesn't
        // linger over (and steal clicks from) the corner handles.
        if (selectedShapeId) set({ selectedShapeId: null })

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
        const previousHanging = getHangingShapeIds(connections)
        const nextConnections = [...connections, connection]
        const nextHanging = getHangingShapeIds(nextConnections)

        // Prefer live poses for pieces already swinging so new joins aim at
        // where the chain is now, not where the store last remembered it.
        const shapesForLayout = shapes.map((shape) => {
          if (!previousHanging.has(shape.id)) return shape
          const body = getBodyRef(shape.id).current
          if (!body) return shape
          const t = body.translation()
          const r = body.rotation()
          return {
            ...shape,
            position: [t.x, t.y, t.z] as Vector3Tuple,
            quaternion: [r.x, r.y, r.z, r.w] as [number, number, number, number],
          }
        })

        const joinsHanging = [...nextHanging].some((id) => !previousHanging.has(id))
        const targets = joinsHanging
          ? computeRestingPositions(shapesForLayout, nextConnections, previousHanging)
          : computeFreeCloseTarget(shapesForLayout, connection)

        // Keep current poses for animated shapes; apply already-closed gaps now.
        const newReelIns = buildReelIns(shapesForLayout, targets)
        const reelingIds = new Set(newReelIns.map((reel) => reel.shapeId))

        set((state) => ({
          connections: nextConnections,
          pendingVertex: null,
          selectedShapeId: null,
          shapes: shapesForLayout.map((shape) => {
            if (reelingIds.has(shape.id)) return shape
            const position = targets.get(shape.id)
            return position ? { ...shape, position } : shape
          }),
          // Replace any in-flight reel for the same shape with the new target.
          reelIns: [
            ...state.reelIns.filter((reel) => !targets.has(reel.shapeId)),
            ...newReelIns,
          ],
        }))
      },

      clearPendingVertex: () => set({ pendingVertex: null }),

      removeConnection: (id) => {
        const { connections, shapes, reelIns } = get()
        const previousHanging = getHangingShapeIds(connections)
        const nextConnections = connections.filter((connection) => connection.id !== id)
        const nextHanging = getHangingShapeIds(nextConnections)
        const removed = connections.find((connection) => connection.id === id)
        const touched = new Set<string>()
        if (removed?.a.kind === 'shape') touched.add(removed.a.shapeId)
        if (removed?.b.kind === 'shape') touched.add(removed.b.shapeId)

        set({
          connections: nextConnections,
          shapes: withSyncedLeavingHanging(shapes, previousHanging, nextHanging),
          reelIns: reelIns.filter((reel) => !touched.has(reel.shapeId)),
        })
      },

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

      finishReelIns: (completed) => {
        if (completed.length === 0) return
        const completedIds = new Set(completed.map((item) => item.shapeId))
        const positionById = new Map(completed.map((item) => [item.shapeId, item.position]))
        set((state) => ({
          reelIns: state.reelIns.filter((reel) => !completedIds.has(reel.shapeId)),
          shapes: state.shapes.map((shape) => {
            const position = positionById.get(shape.id)
            return position ? { ...shape, position } : shape
          }),
        }))
      },

      reset: () => {
        for (const shape of get().shapes) clearBodyRef(shape.id)
        set({
          shapes: [],
          connections: [],
          pendingVertex: null,
          placedCount: 0,
          selectedShapeId: null,
          reelIns: [],
        })
      },

      getStrawCounts: () => computeStrawCounts(get().shapes),
    }),
    {
      name: PERSISTED_STORAGE_KEY,
      version: PERSISTED_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Click-in-progress / selection / reel-in state are transient UI concerns.
      partialize: (state): PersistedMobileState => ({
        shapes: state.shapes,
        connections: state.connections,
        strawSize: state.strawSize,
        placedCount: state.placedCount,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<StrawMobileState>),
        // Never restore in-flight UI animations from storage.
        reelIns: [],
        pendingVertex: null,
        selectedShapeId: null,
      }),
    },
  ),
)
