import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { PRIMITIVE_GENERATORS, type ShapeKind, type Vector3Tuple } from '../geometry/primitives'
import { clearBodyRef, getBodyRef } from '../physics/bodyRefRegistry'
import { buildReelIns, computeFreeCloseTarget } from '../physics/reelIn'
import { computeRestingPositions, getHangingShapeIds } from '../physics/restingLayout'
import { findAddPosition } from '../scene/placement'
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
const PERSISTED_STORAGE_VERSION = 2
/** Max design snapshots kept for undo / redo. */
const HISTORY_LIMIT = 50

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

/** The subset of state that's worth remembering between visits / undo steps. */
export type PersistedMobileState = {
  shapes: Shape[]
  connections: Connection[]
  strawSize: StrawSize
}

/** Clone the durable design fields for a history entry. */
function snapshotDesign(state: PersistedMobileState): PersistedMobileState {
  return structuredClone({
    shapes: state.shapes,
    connections: state.connections,
    strawSize: state.strawSize,
  })
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
  /** The free shape currently picked up for dragging, if any. */
  selectedShapeId: string | null
  /** In-progress thread shorten animations (not persisted). */
  reelIns: ShapeReelIn[]
  /** Live poses while reeling — drives the mesh without touching persisted shapes. */
  reelPositions: Record<string, Vector3Tuple>
  /** Prior design snapshots for Undo (not persisted across reloads). */
  past: PersistedMobileState[]
  /** Snapshots undone, available for Redo (not persisted across reloads). */
  future: PersistedMobileState[]

  /** Snapshot the current design before an undoable mutation (or drag-start). */
  pushHistory: () => void
  undo: () => void
  redo: () => void
  addShape: (kind: ShapeKind, position?: Vector3Tuple) => string
  removeShape: (id: string) => void
  setStrawSize: (size: StrawSize) => void
  selectVertex: (endpoint: EndpointRef) => void
  clearPendingVertex: () => void
  removeConnection: (id: string) => void
  setShapeTransform: (id: string, position: Vector3Tuple, quaternion: [number, number, number, number]) => void
  moveShape: (id: string, position: Vector3Tuple) => void
  selectShape: (id: string | null) => void
  setReelPositions: (positions: Record<string, Vector3Tuple>) => void
  finishReelIns: (completed: { shapeId: string; position: Vector3Tuple }[]) => void
  reset: () => void
  /** Replace the working draft with a gallery / import snapshot. */
  loadProject: (snapshot: PersistedMobileState) => void
  getStrawCounts: () => StrawCounts
}

function applyDesignSnapshot(
  set: (
    partial:
      | Partial<StrawMobileState>
      | ((state: StrawMobileState) => Partial<StrawMobileState>),
  ) => void,
  get: () => StrawMobileState,
  snapshot: PersistedMobileState,
  history: { past: PersistedMobileState[]; future: PersistedMobileState[] },
) {
  // Drop body refs so physics remounts from the restored shape list.
  for (const shape of get().shapes) clearBodyRef(shape.id)
  set({
    shapes: snapshot.shapes,
    connections: snapshot.connections,
    strawSize: snapshot.strawSize,
    pendingVertex: null,
    selectedShapeId: null,
    reelIns: [],
    reelPositions: {},
    past: history.past,
    future: history.future,
  })
}

export const useStrawMobileStore = create<StrawMobileState>()(
  persist(
    (set, get) => ({
      shapes: [],
      connections: [],
      strawSize: 1,
      pendingVertex: null,
      selectedShapeId: null,
      reelIns: [],
      reelPositions: {},
      past: [],
      future: [],

      pushHistory: () => {
        const state = get()
        const entry = snapshotDesign(state)
        const past = [...state.past, entry]
        if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT)
        set({ past, future: [] })
      },

      undo: () => {
        const state = get()
        if (state.past.length === 0) return
        const past = [...state.past]
        const previous = past.pop()!
        const current = snapshotDesign(state)
        applyDesignSnapshot(set, get, previous, {
          past,
          future: [...state.future, current],
        })
      },

      redo: () => {
        const state = get()
        if (state.future.length === 0) return
        const future = [...state.future]
        const next = future.pop()!
        const current = snapshotDesign(state)
        applyDesignSnapshot(set, get, next, {
          past: [...state.past, current],
          future,
        })
      },

      addShape: (kind, position) => {
        get().pushHistory()
        const { vertices, edges } = PRIMITIVE_GENERATORS[kind]()
        const { strawSize, shapes } = get()
        const id = createId()
        // Drop-from-panel supplies an explicit world position; click-to-add
        // uses camera-aware non-overlapping placement.
        const placedAt = position ?? findAddPosition(shapes, kind, strawSize)
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
          // Drop-placed shapes get selected so the gizmo appears immediately;
          // click-to-add (no position) keeps clearing selection as before.
          selectedShapeId: position !== undefined ? id : null,
        }))
        return id
      },

      removeShape: (id) => {
        get().pushHistory()
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
        const { [id]: _removed, ...restReelPositions } = get().reelPositions
        set({
          shapes: syncedShapes.filter((shape) => shape.id !== id),
          connections: nextConnections,
          reelIns: reelIns.filter((reel) => reel.shapeId !== id),
          reelPositions: restReelPositions,
          pendingVertex:
            pendingVertex?.kind === 'shape' && pendingVertex.shapeId === id ? null : pendingVertex,
          selectedShapeId: selectedShapeId === id ? null : selectedShapeId,
        })
      },

      setStrawSize: (size) => {
        if (get().strawSize === size) return
        get().pushHistory()
        set({ strawSize: size })
      },

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

        get().pushHistory()

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

        set((state) => {
          const nextReelPositions = { ...state.reelPositions }
          for (const reel of newReelIns) {
            nextReelPositions[reel.shapeId] = reel.from
          }
          for (const shapeId of targets.keys()) {
            if (!reelingIds.has(shapeId)) delete nextReelPositions[shapeId]
          }
          return {
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
            reelPositions: nextReelPositions,
          }
        })
      },

      clearPendingVertex: () => set({ pendingVertex: null }),

      removeConnection: (id) => {
        get().pushHistory()
        const { connections, shapes, reelIns } = get()
        const previousHanging = getHangingShapeIds(connections)
        const nextConnections = connections.filter((connection) => connection.id !== id)
        const nextHanging = getHangingShapeIds(nextConnections)
        const removed = connections.find((connection) => connection.id === id)
        const touched = new Set<string>()
        if (removed?.a.kind === 'shape') touched.add(removed.a.shapeId)
        if (removed?.b.kind === 'shape') touched.add(removed.b.shapeId)

        const nextReelPositions = { ...get().reelPositions }
        for (const shapeId of touched) delete nextReelPositions[shapeId]
        set({
          connections: nextConnections,
          shapes: withSyncedLeavingHanging(shapes, previousHanging, nextHanging),
          reelIns: reelIns.filter((reel) => !touched.has(reel.shapeId)),
          reelPositions: nextReelPositions,
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

      setReelPositions: (positions) =>
        set((state) => ({
          reelPositions: { ...state.reelPositions, ...positions },
        })),

      finishReelIns: (completed) => {
        if (completed.length === 0) return
        const completedIds = new Set(completed.map((item) => item.shapeId))
        const positionById = new Map(completed.map((item) => [item.shapeId, item.position]))
        set((state) => {
          const nextReelPositions = { ...state.reelPositions }
          for (const id of completedIds) delete nextReelPositions[id]
          return {
            reelIns: state.reelIns.filter((reel) => !completedIds.has(reel.shapeId)),
            reelPositions: nextReelPositions,
            shapes: state.shapes.map((shape) => {
              const position = positionById.get(shape.id)
              return position ? { ...shape, position } : shape
            }),
          }
        })
      },

      reset: () => {
        get().pushHistory()
        for (const shape of get().shapes) clearBodyRef(shape.id)
        set({
          shapes: [],
          connections: [],
          pendingVertex: null,
          selectedShapeId: null,
          reelIns: [],
          reelPositions: {},
        })
      },

      loadProject: (snapshot) => {
        get().pushHistory()
        for (const shape of get().shapes) clearBodyRef(shape.id)
        set({
          shapes: snapshot.shapes,
          connections: snapshot.connections,
          strawSize: snapshot.strawSize,
          pendingVertex: null,
          selectedShapeId: null,
          reelIns: [],
          reelPositions: {},
        })
      },

      getStrawCounts: () => computeStrawCounts(get().shapes),
    }),
    {
      name: PERSISTED_STORAGE_KEY,
      version: PERSISTED_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Click-in-progress / selection / reel-in / undo stacks are transient.
      partialize: (state): PersistedMobileState => ({
        shapes: state.shapes,
        connections: state.connections,
        strawSize: state.strawSize,
      }),
      migrate: (persisted) => {
        const state = persisted as PersistedMobileState & { placedCount?: number }
        // Drop legacy workbench slot counter; placement is camera-aware now.
        const { placedCount: _placedCount, ...rest } = state
        return rest
      },
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<StrawMobileState>),
        // Never restore in-flight UI animations or undo stacks from storage.
        reelIns: [],
        reelPositions: {},
        pendingVertex: null,
        selectedShapeId: null,
        past: [],
        future: [],
      }),
    },
  ),
)
