import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { PRIMITIVE_GENERATORS, type ShapeKind, type Vector3Tuple } from '../geometry/primitives'
import { clearBodyRef, getBodyRef } from '../physics/bodyRefRegistry'
import { buildReelIns, connectionInvolvesReelIn, reelInBodyKeys } from '../physics/reelIn'
import {
  computeFreeTightenPoses,
  computeHangingClosePoses,
  computeRestingPoses,
  getHangingShapeIds,
} from '../physics/restingLayout'
import { findAddPosition } from '../scene/placement'
import {
  DEFAULT_PROJECT_NAME,
  endpointBodyKey,
  endpointsEqual,
  type Connection,
  type EndpointRef,
  type OverlapSuggest,
  type QuatTuple,
  type Shape,
  type ShapePose,
  type ShapeReelIn,
  type StrawCounts,
  type StrawSize,
} from './types'

import { BASE_ANCHOR_Y } from './shapeSpace'

export {
  ANCHOR_POSITION,
  BASE_ANCHOR_POSITION,
  BASE_ANCHOR_Y,
  BASE_STRAW_LENGTH,
  getScaledVertex,
} from './shapeSpace'

/**
 * The current design (shapes, thread connections, and enough bookkeeping to
 * keep adding to it sensibly) is auto-saved to localStorage on every change,
 * so reloading the page — or closing and reopening the tab later — picks up
 * right where things were left off. Only the durable design lives here;
 * transient UI state (what's mid-click / selected / reeling) intentionally
 * always starts fresh, see `partialize` below.
 */
const PERSISTED_STORAGE_KEY = 'straw-mobile-designer/project'
const PERSISTED_STORAGE_VERSION = 3
/** Max design snapshots kept for undo / redo. */
const HISTORY_LIMIT = 50
/** World offset applied to duplicated shapes so copies don't stack. */
const DUPLICATE_OFFSET: Vector3Tuple = [0.45, 0.45, 0]

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const EMPTY_SELECTION = {
  selectedShapeIds: [] as string[],
  selectionAnchorId: null as string | null,
}

function remapEndpoint(endpoint: EndpointRef, idMap: Map<string, string>): EndpointRef | null {
  if (endpoint.kind === 'anchor') return null
  const nextId = idMap.get(endpoint.shapeId)
  if (!nextId) return null
  return { kind: 'shape', shapeId: nextId, vertexIndex: endpoint.vertexIndex }
}

/** The subset of state that's worth remembering between visits / undo steps. */
export type PersistedMobileState = {
  shapes: Shape[]
  connections: Connection[]
  strawSize: StrawSize
}

/** Full draft persisted to localStorage (includes metadata outside undo history). */
export type PersistedDraftState = PersistedMobileState & {
  projectName: string
  lastSavedAt: number
}

/** Clone the durable design fields for a history entry. */
function snapshotDesign(state: PersistedMobileState): PersistedMobileState {
  return structuredClone({
    shapes: state.shapes,
    connections: state.connections,
    strawSize: state.strawSize,
  })
}

/** Solid-equivalent total: two 1/2 straws count as one solid straw. */
export function computeStrawCounts(shapes: Shape[]): StrawCounts {
  const bySize: Record<StrawSize, number> = { 1: 0, 0.5: 0, 0.25: 0 }
  for (const shape of shapes) {
    bySize[shape.size] += shape.edges.length
  }
  return {
    bySize,
    total: bySize[1] + bySize[0.5] * 0.5 + bySize[0.25] * 0.25,
  }
}

/** Format solid-equivalent totals without trailing zeros (e.g. 1.5, 2). */
export function formatSolidEquivalent(total: number): string {
  if (Number.isInteger(total)) return String(total)
  return String(parseFloat(total.toFixed(2)))
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
      quaternion: [r.x, r.y, r.z, r.w] as QuatTuple,
    }
  })
  return changed ? updated : shapes
}

/** Transient edit tool: select/drag/connect vs click-to-cut. */
export type ActiveTool = 'select' | 'scissors'

interface StrawMobileState {
  shapes: Shape[]
  connections: Connection[]
  strawSize: StrawSize
  /** Display name for the current draft (persisted; not part of undo history). */
  projectName: string
  /** Epoch ms of the last autosave write (persisted). */
  lastSavedAt: number
  pendingVertex: EndpointRef | null
  /** Free corners currently overlapping long enough to suggest auto-connect. */
  overlapSuggest: OverlapSuggest | null
  /** Shapes currently selected (last id is the primary / gizmo target). */
  selectedShapeIds: string[]
  /** Anchor for Shift+range selection in the sidebar list. */
  selectionAnchorId: string | null
  /** Current edit tool (not persisted). */
  activeTool: ActiveTool
  /** Performance mode: disables shadows (not persisted). */
  turboMode: boolean
  /** In-progress thread shorten animations (not persisted). */
  reelIns: ShapeReelIn[]
  /**
   * Connection ids whose spherical joints stay unmounted until reel-in finishes.
   * Used for hanging closes so existing parent joints remain active.
   */
  deferredConnectionIds: string[]
  /** Live poses while reeling — drives the mesh without touching persisted shapes. */
  reelPositions: Record<string, Vector3Tuple>
  reelQuaternions: Record<string, QuatTuple>
  /** Prior design snapshots for Undo (not persisted across reloads). */
  past: PersistedMobileState[]
  /** Snapshots undone, available for Redo (not persisted across reloads). */
  future: PersistedMobileState[]
  /**
   * Bumped when the design is replaced wholesale (undo / redo / reset / load).
   * PhysicsScene keys the Rapier world on this so bodies remount with fresh
   * refs and correct hull mass — clearing the registry alone is not enough.
   */
  physicsEpoch: number
  /**
   * Live ceiling-hook world Y. Raised by AnchorLiftController when the hanging
   * chain would dip below clearance; not persisted (re-lifts after remount).
   */
  anchorY: number

  /** Snapshot the current design before an undoable mutation (or drag-start). */
  pushHistory: () => void
  setAnchorY: (y: number) => void
  undo: () => void
  redo: () => void
  addShape: (kind: ShapeKind, position?: Vector3Tuple) => string
  removeShape: (id: string) => void
  removeShapes: (ids: string[]) => void
  setStrawSize: (size: StrawSize) => void
  setProjectName: (name: string) => void
  selectVertex: (endpoint: EndpointRef) => void
  /** Tie two corners (manual second-click or overlap dwell). Returns true if created. */
  connectEndpoints: (a: EndpointRef, b: EndpointRef) => boolean
  clearPendingVertex: () => void
  setOverlapSuggest: (suggest: OverlapSuggest | null) => void
  removeConnection: (id: string) => void
  setShapeTransform: (id: string, position: Vector3Tuple, quaternion: QuatTuple) => void
  moveShape: (id: string, position: Vector3Tuple) => void
  selectShape: (id: string | null) => void
  toggleShapeSelection: (id: string) => void
  selectShapeRange: (id: string) => void
  duplicateSelection: () => void
  setActiveTool: (tool: ActiveTool) => void
  setTurboMode: (on: boolean) => void
  setReelPoses: (
    positions: Record<string, Vector3Tuple>,
    quaternions: Record<string, QuatTuple>,
  ) => void
  finishReelIns: (
    completed: { shapeId: string; position: Vector3Tuple; quaternion: QuatTuple }[],
  ) => void
  reset: () => void
  /** Replace the working draft with a gallery / import snapshot. */
  loadProject: (snapshot: PersistedMobileState) => void
  getStrawCounts: () => StrawCounts
}

/** Drop registry entries and bump the epoch so Rapier bodies remount cleanly. */
function invalidatePhysics(get: () => StrawMobileState): number {
  for (const shape of get().shapes) clearBodyRef(shape.id)
  clearBodyRef('anchor')
  return get().physicsEpoch + 1
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
  const physicsEpoch = invalidatePhysics(get)
  set({
    shapes: snapshot.shapes,
    connections: snapshot.connections,
    strawSize: snapshot.strawSize,
    pendingVertex: null,
    overlapSuggest: null,
    ...EMPTY_SELECTION,
    activeTool: 'select',
    reelIns: [],
    deferredConnectionIds: [],
    reelPositions: {},
    reelQuaternions: {},
    past: history.past,
    future: history.future,
    physicsEpoch,
    anchorY: BASE_ANCHOR_Y,
  })
}

export const useStrawMobileStore = create<StrawMobileState>()(
  persist(
    (set, get) => ({
      shapes: [],
      connections: [],
      strawSize: 1,
      projectName: DEFAULT_PROJECT_NAME,
      lastSavedAt: Date.now(),
      pendingVertex: null,
      overlapSuggest: null,
      selectedShapeIds: [],
      selectionAnchorId: null,
      activeTool: 'select',
      turboMode: false,
      reelIns: [],
      deferredConnectionIds: [],
      reelPositions: {},
      reelQuaternions: {},
      past: [],
      future: [],
      physicsEpoch: 0,
      anchorY: BASE_ANCHOR_Y,

      setAnchorY: (y) => {
        const next = Math.max(BASE_ANCHOR_Y, y)
        if (Math.abs(get().anchorY - next) < 1e-5) return
        set({ anchorY: next })
      },

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
          ...(position !== undefined
            ? { selectedShapeIds: [id], selectionAnchorId: id }
            : EMPTY_SELECTION),
        }))
        return id
      },

      removeShape: (id) => {
        get().removeShapes([id])
      },

      removeShapes: (ids) => {
        if (ids.length === 0) return
        const removeSet = new Set(ids)
        get().pushHistory()
        const {
          connections,
          shapes,
          selectedShapeIds,
          selectionAnchorId,
          pendingVertex,
          overlapSuggest,
          reelIns,
        } = get()
        const previousHanging = getHangingShapeIds(connections)
        const nextConnections = connections.filter(
          (connection) =>
            !(connection.a.kind === 'shape' && removeSet.has(connection.a.shapeId)) &&
            !(connection.b.kind === 'shape' && removeSet.has(connection.b.shapeId)),
        )
        const nextHanging = getHangingShapeIds(nextConnections)
        const syncedShapes = withSyncedLeavingHanging(shapes, previousHanging, nextHanging)

        for (const id of removeSet) clearBodyRef(id)
        const nextReelPositions = { ...get().reelPositions }
        const nextReelQuaternions = { ...get().reelQuaternions }
        for (const id of removeSet) {
          delete nextReelPositions[id]
          delete nextReelQuaternions[id]
        }

        const touchesRemoved = (endpoint: EndpointRef | undefined) =>
          endpoint?.kind === 'shape' && removeSet.has(endpoint.shapeId)

        const nextSelected = selectedShapeIds.filter((id) => !removeSet.has(id))
        set({
          shapes: syncedShapes.filter((shape) => !removeSet.has(shape.id)),
          connections: nextConnections,
          reelIns: reelIns.filter((reel) => !removeSet.has(reel.shapeId)),
          reelPositions: nextReelPositions,
          reelQuaternions: nextReelQuaternions,
          pendingVertex:
            pendingVertex?.kind === 'shape' && removeSet.has(pendingVertex.shapeId)
              ? null
              : pendingVertex,
          overlapSuggest:
            touchesRemoved(overlapSuggest?.a) || touchesRemoved(overlapSuggest?.b)
              ? null
              : overlapSuggest,
          selectedShapeIds: nextSelected,
          selectionAnchorId:
            selectionAnchorId && removeSet.has(selectionAnchorId) ? null : selectionAnchorId,
        })
      },

      setStrawSize: (size) => {
        if (get().strawSize === size) return
        get().pushHistory()
        set({ strawSize: size })
      },

      setProjectName: (name) => {
        const trimmed = name.trim() || DEFAULT_PROJECT_NAME
        if (get().projectName === trimmed) return
        set({ projectName: trimmed, lastSavedAt: Date.now() })
      },

      selectVertex: (endpoint) => {
        const { pendingVertex, selectedShapeIds } = get()
        // Picking a corner to tie thread is a distinct interaction from dragging a
        // shape around; clear any active drag selection so its gizmo doesn't
        // linger over (and steal clicks from) the corner handles.
        if (selectedShapeIds.length > 0) set({ ...EMPTY_SELECTION })

        if (!pendingVertex) {
          set({ pendingVertex: endpoint })
          return
        }

        if (endpointsEqual(pendingVertex, endpoint)) {
          set({ pendingVertex: null })
          return
        }

        get().connectEndpoints(pendingVertex, endpoint)
      },

      connectEndpoints: (a, b) => {
        if (endpointsEqual(a, b)) {
          set({ pendingVertex: null, overlapSuggest: null })
          return false
        }

        const { connections, shapes } = get()
        const alreadyConnected = connections.some(
          (connection) =>
            (endpointsEqual(connection.a, a) && endpointsEqual(connection.b, b)) ||
            (endpointsEqual(connection.a, b) && endpointsEqual(connection.b, a)),
        )

        if (alreadyConnected) {
          set({ pendingVertex: null, overlapSuggest: null })
          return false
        }

        get().pushHistory()

        const connection: Connection = {
          id: createId(),
          a,
          b,
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
            quaternion: [r.x, r.y, r.z, r.w] as QuatTuple,
          }
        })

        const joinsHanging = [...nextHanging].some((id) => !previousHanging.has(id))
        const aKey = endpointBodyKey(a)
        const bKey = endpointBodyKey(b)
        const aAlreadyOnChain = aKey === 'anchor' || previousHanging.has(aKey)
        const bAlreadyOnChain = bKey === 'anchor' || previousHanging.has(bKey)
        // Hanging↔hanging (or hanging↔hook on an already-hung piece): don't run
        // the free workbench tightener — it ignores hook pins and yanks the chain.
        // Close one endpoint onto the other (translation-only) and force a reel
        // so the new joint stays deferred while the thread shortens — including
        // tiny overlap gaps that would otherwise skip animation entirely.
        let targets: Map<string, ShapePose>
        let forceReel = false
        if (joinsHanging) {
          targets = computeRestingPoses(shapesForLayout, nextConnections, previousHanging)
        } else if (aAlreadyOnChain && bAlreadyOnChain) {
          targets = computeHangingClosePoses(shapesForLayout, nextConnections, connection)
          forceReel = true
        } else {
          targets = computeFreeTightenPoses(shapesForLayout, nextConnections, connection)
        }

        // Keep current poses for animated shapes; apply already-closed gaps now.
        const newReelIns = buildReelIns(shapesForLayout, targets, performance.now(), {
          force: forceReel,
        })
        const reelingIds = new Set(newReelIns.map((reel) => reel.shapeId))

        set((state) => {
          const nextReelPositions = { ...state.reelPositions }
          const nextReelQuaternions = { ...state.reelQuaternions }
          for (const reel of newReelIns) {
            nextReelPositions[reel.shapeId] = reel.from
            nextReelQuaternions[reel.shapeId] = reel.fromQuat
          }
          for (const shapeId of targets.keys()) {
            if (!reelingIds.has(shapeId)) {
              delete nextReelPositions[shapeId]
              delete nextReelQuaternions[shapeId]
            }
          }
          return {
            connections: nextConnections,
            pendingVertex: null,
            overlapSuggest: null,
            ...EMPTY_SELECTION,
            shapes: shapesForLayout.map((shape) => {
              if (reelingIds.has(shape.id)) return shape
              const pose = targets.get(shape.id)
              return pose
                ? { ...shape, position: pose.position, quaternion: pose.quaternion }
                : shape
            }),
            // Replace any in-flight reel for the same shape with the new target.
            reelIns: [
              ...state.reelIns.filter((reel) => !targets.has(reel.shapeId)),
              ...newReelIns,
            ],
            // Hanging closes keep parent joints mounted; only the new tie waits.
            deferredConnectionIds: forceReel
              ? [...new Set([...state.deferredConnectionIds, connection.id])]
              : state.deferredConnectionIds,
            reelPositions: nextReelPositions,
            reelQuaternions: nextReelQuaternions,
          }
        })
        return true
      },

      clearPendingVertex: () => set({ pendingVertex: null }),

      setOverlapSuggest: (suggest) => {
        const current = get().overlapSuggest
        if (current === suggest) return
        if (
          current &&
          suggest &&
          current.startedAt === suggest.startedAt &&
          ((endpointsEqual(current.a, suggest.a) && endpointsEqual(current.b, suggest.b)) ||
            (endpointsEqual(current.a, suggest.b) && endpointsEqual(current.b, suggest.a)))
        ) {
          return
        }
        if (!current && !suggest) return
        set({ overlapSuggest: suggest })
      },

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
        const nextReelQuaternions = { ...get().reelQuaternions }
        for (const shapeId of touched) {
          delete nextReelPositions[shapeId]
          delete nextReelQuaternions[shapeId]
        }
        set({
          connections: nextConnections,
          shapes: withSyncedLeavingHanging(shapes, previousHanging, nextHanging),
          reelIns: reelIns.filter((reel) => !touched.has(reel.shapeId)),
          reelPositions: nextReelPositions,
          reelQuaternions: nextReelQuaternions,
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

      selectShape: (id) =>
        set(
          id === null
            ? EMPTY_SELECTION
            : { selectedShapeIds: [id], selectionAnchorId: id },
        ),

      toggleShapeSelection: (id) => {
        const { selectedShapeIds, selectionAnchorId } = get()
        if (selectedShapeIds.includes(id)) {
          const next = selectedShapeIds.filter((selectedId) => selectedId !== id)
          set({
            selectedShapeIds: next,
            selectionAnchorId:
              selectionAnchorId === id
                ? (next[next.length - 1] ?? null)
                : selectionAnchorId,
          })
          return
        }
        set({
          selectedShapeIds: [...selectedShapeIds, id],
          selectionAnchorId: id,
        })
      },

      selectShapeRange: (id) => {
        const { shapes, selectionAnchorId } = get()
        const anchorId = selectionAnchorId ?? id
        const anchorIndex = shapes.findIndex((shape) => shape.id === anchorId)
        const targetIndex = shapes.findIndex((shape) => shape.id === id)
        if (anchorIndex < 0 || targetIndex < 0) {
          set({ selectedShapeIds: [id], selectionAnchorId: id })
          return
        }
        const start = Math.min(anchorIndex, targetIndex)
        const end = Math.max(anchorIndex, targetIndex)
        set({
          selectedShapeIds: shapes.slice(start, end + 1).map((shape) => shape.id),
          // Keep the original anchor fixed for subsequent Shift+range clicks.
          selectionAnchorId: anchorId,
        })
      },

      duplicateSelection: () => {
        const { shapes, connections, selectedShapeIds } = get()
        if (selectedShapeIds.length === 0) return

        const selectedSet = new Set(selectedShapeIds)
        const selectedShapes = shapes.filter((shape) => selectedSet.has(shape.id))
        if (selectedShapes.length === 0) return

        get().pushHistory()

        const idMap = new Map<string, string>()
        const clones: Shape[] = selectedShapes.map((shape) => {
          const newId = createId()
          idMap.set(shape.id, newId)
          return {
            ...shape,
            id: newId,
            vertices: shape.vertices.map((vertex) => [...vertex] as Vector3Tuple),
            edges: shape.edges.map((edge) => [...edge] as [number, number]),
            position: [
              shape.position[0] + DUPLICATE_OFFSET[0],
              shape.position[1] + DUPLICATE_OFFSET[1],
              shape.position[2] + DUPLICATE_OFFSET[2],
            ] as Vector3Tuple,
            quaternion: [...shape.quaternion] as [number, number, number, number],
          }
        })

        const clonedConnections: Connection[] = []
        for (const connection of connections) {
          const a = remapEndpoint(connection.a, idMap)
          const b = remapEndpoint(connection.b, idMap)
          // Only copy threads whose both ends land inside the duplicated set.
          if (!a || !b) continue
          clonedConnections.push({ id: createId(), a, b })
        }

        const newIds = clones.map((shape) => shape.id)
        set((state) => ({
          shapes: [...state.shapes, ...clones],
          connections: [...state.connections, ...clonedConnections],
          selectedShapeIds: newIds,
          selectionAnchorId: newIds[newIds.length - 1] ?? null,
        }))
      },

      setActiveTool: (tool) => {
        if (tool === 'scissors') {
          set({
            activeTool: tool,
            ...EMPTY_SELECTION,
            pendingVertex: null,
            overlapSuggest: null,
          })
          return
        }
        set({ activeTool: tool })
      },

      setTurboMode: (on) => {
        set({ turboMode: on })
      },

      setReelPoses: (positions, quaternions) =>
        set((state) => ({
          reelPositions: { ...state.reelPositions, ...positions },
          reelQuaternions: { ...state.reelQuaternions, ...quaternions },
        })),

      finishReelIns: (completed) => {
        if (completed.length === 0) return
        const completedIds = new Set(completed.map((item) => item.shapeId))
        const poseById = new Map(
          completed.map((item) => [
            item.shapeId,
            { position: item.position, quaternion: item.quaternion },
          ]),
        )
        set((state) => {
          const nextReelPositions = { ...state.reelPositions }
          const nextReelQuaternions = { ...state.reelQuaternions }
          for (const id of completedIds) {
            delete nextReelPositions[id]
            delete nextReelQuaternions[id]
          }
          const remainingReelIns = state.reelIns.filter(
            (reel) => !completedIds.has(reel.shapeId),
          )
          const stillReeling = reelInBodyKeys(remainingReelIns)
          return {
            reelIns: remainingReelIns,
            // Drop deferred joints once neither endpoint is still reeling.
            deferredConnectionIds: state.deferredConnectionIds.filter((id) => {
              const connection = state.connections.find((item) => item.id === id)
              if (!connection) return false
              return connectionInvolvesReelIn(connection, stillReeling)
            }),
            reelPositions: nextReelPositions,
            reelQuaternions: nextReelQuaternions,
            shapes: state.shapes.map((shape) => {
              const pose = poseById.get(shape.id)
              return pose
                ? { ...shape, position: pose.position, quaternion: pose.quaternion }
                : shape
            }),
          }
        })
      },

      reset: () => {
        get().pushHistory()
        const physicsEpoch = invalidatePhysics(get)
        set({
          shapes: [],
          connections: [],
          pendingVertex: null,
          overlapSuggest: null,
          ...EMPTY_SELECTION,
          activeTool: 'select',
          turboMode: false,
          reelIns: [],
          deferredConnectionIds: [],
          reelPositions: {},
          reelQuaternions: {},
          physicsEpoch,
          anchorY: BASE_ANCHOR_Y,
        })
      },

      loadProject: (snapshot) => {
        get().pushHistory()
        const physicsEpoch = invalidatePhysics(get)
        set({
          shapes: snapshot.shapes,
          connections: snapshot.connections,
          strawSize: snapshot.strawSize,
          pendingVertex: null,
          overlapSuggest: null,
          ...EMPTY_SELECTION,
          activeTool: 'select',
          turboMode: false,
          reelIns: [],
          deferredConnectionIds: [],
          reelPositions: {},
          reelQuaternions: {},
          physicsEpoch,
          anchorY: BASE_ANCHOR_Y,
        })
      },

      getStrawCounts: () => computeStrawCounts(get().shapes),
    }),
    {
      name: PERSISTED_STORAGE_KEY,
      version: PERSISTED_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Click-in-progress / selection / reel-in / undo stacks are transient.
      partialize: (state): PersistedDraftState => ({
        shapes: state.shapes,
        connections: state.connections,
        strawSize: state.strawSize,
        projectName: state.projectName,
        lastSavedAt: state.lastSavedAt,
      }),
      migrate: (persisted, version) => {
        const state = persisted as PersistedDraftState & { placedCount?: number }
        // Drop legacy workbench slot counter; placement is camera-aware now.
        const { placedCount: _placedCount, ...rest } = state
        if (version < 3) {
          return {
            ...rest,
            projectName: rest.projectName ?? DEFAULT_PROJECT_NAME,
            lastSavedAt: rest.lastSavedAt ?? Date.now(),
          }
        }
        return rest
      },
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<StrawMobileState>),
        // Never restore in-flight UI animations or undo stacks from storage.
        reelIns: [],
        deferredConnectionIds: [],
        reelPositions: {},
        reelQuaternions: {},
        pendingVertex: null,
        overlapSuggest: null,
        ...EMPTY_SELECTION,
        activeTool: 'select',
        turboMode: false,
        past: [],
        future: [],
        physicsEpoch: 0,
        anchorY: BASE_ANCHOR_Y,
      }),
    },
  ),
)

/** Stamp lastSavedAt whenever the durable design (or name) changes after hydration. */
let draftSaveHydrated = useStrawMobileStore.persist.hasHydrated()
let syncingLastSavedAt = false

function markDraftSaveHydrated() {
  draftSaveHydrated = true
}

useStrawMobileStore.persist.onFinishHydration(markDraftSaveHydrated)

useStrawMobileStore.subscribe((state, prev) => {
  if (!draftSaveHydrated || syncingLastSavedAt) return
  const designChanged =
    state.shapes !== prev.shapes ||
    state.connections !== prev.connections ||
    state.strawSize !== prev.strawSize ||
    state.projectName !== prev.projectName
  if (!designChanged) return
  if (state.lastSavedAt !== prev.lastSavedAt) return
  syncingLastSavedAt = true
  useStrawMobileStore.setState({ lastSavedAt: Date.now() })
  syncingLastSavedAt = false
})
