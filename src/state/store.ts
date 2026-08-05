import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  PRIMITIVE_GENERATORS,
  type PrimitiveKind,
  type Vector3Tuple,
} from '../geometry/primitives'
import { explodeAssembly } from '../geometry/explodeAssembly'
import { fuseShapes } from '../geometry/fuseShapes'
import { clearBodyRef, getBodyRef } from '../physics/bodyRefRegistry'
import { buildReelIns, connectionInvolvesReelIn, reelInBodyKeys } from '../physics/reelIn'
import { findFusableCluster } from '../physics/rigidClusters'
import {
  computeFreeTightenPoses,
  computeHangingClosePoses,
  computeRestingPoses,
  getHangingShapeIds,
} from '../physics/restingLayout'
import { syncShapeTransformsFromPhysics } from '../physics/syncTransforms'
import { findAddPosition, findGroupAddDelta } from '../scene/placement'
import {
  DEFAULT_PROJECT_NAME,
  endpointBodyKey,
  endpointsEqual,
  endpointVertexKey,
  EMPTY_SLOTS,
  normalizeSlots,
  type Connection,
  type EndpointRef,
  type OverlapScanUi,
  type OverlapSuggest,
  type QuatTuple,
  type Shape,
  type ShapePose,
  type ShapeReelIn,
  type SlotBuffer,
  type SlotBuffers,
  type SlotIndex,
  type StrawCounts,
  type StrawSize,
} from './types'

import { BASE_ANCHOR_Y } from './shapeSpace'

export type { SlotBuffer, SlotBuffers, SlotIndex } from './types'

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
 * right where things were left off. Selection buffer slots are persisted with
 * the draft (and each gallery project) so they stay per-project.
 * Edit-tool and mode toggles (select/scissors, overlap scanner, rigid loops)
 * are persisted across reloads; mid-click / selection / reel-in still start
 * fresh — see `partialize` below.
 */
const PERSISTED_STORAGE_KEY = 'straw-mobile-designer/project'
const PERSISTED_STORAGE_VERSION = 5
/** Max design snapshots kept for undo / redo. */
const HISTORY_LIMIT = 50
/** World offset applied to duplicated shapes so copies don't stack. */
const DUPLICATE_OFFSET: Vector3Tuple = [0.45, 0.45, 0]

/** Transient edit tool: orbit/navigate, select/marquee, or click-to-cut. */
export type ActiveTool = 'none' | 'select' | 'scissors'

const ACTIVE_TOOLS: readonly ActiveTool[] = ['none', 'select', 'scissors']

function normalizeActiveTool(value: unknown): ActiveTool {
  return ACTIVE_TOOLS.includes(value as ActiveTool) ? (value as ActiveTool) : 'none'
}

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
  /** Per-project selection buffers (toolbar 1/2/3). */
  slots: SlotBuffers
  /** Last active edit tool (select / scissors / none). */
  activeTool: ActiveTool
  /** Whether the overlap proximity scanner is on. */
  overlapScannerEnabled: boolean
  /** Whether closed straw loops fuse into rigid pieces. */
  rigidLoopsEnabled: boolean
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

/** Snapshot selected shapes and threads that connect only within the set. */
function snapshotSelectedBuffer(
  shapes: Shape[],
  connections: Connection[],
  selectedShapeIds: string[],
): SlotBuffer | null {
  if (selectedShapeIds.length === 0) return null
  const selectedSet = new Set(selectedShapeIds)
  const selectedShapes = shapes.filter((shape) => selectedSet.has(shape.id))
  if (selectedShapes.length === 0) return null

  const clonedShapes: Shape[] = selectedShapes.map((shape) => ({
    ...shape,
    vertices: shape.vertices.map((vertex) => [...vertex] as Vector3Tuple),
    edges: shape.edges.map((edge) => [...edge] as [number, number]),
    position: [...shape.position] as Vector3Tuple,
    quaternion: [...shape.quaternion] as QuatTuple,
  }))

  const clonedConnections: Connection[] = []
  for (const connection of connections) {
    const aIn = connection.a.kind === 'shape' && selectedSet.has(connection.a.shapeId)
    const bIn = connection.b.kind === 'shape' && selectedSet.has(connection.b.shapeId)
    if (!aIn || !bIn) continue
    clonedConnections.push({
      id: connection.id,
      a: { ...connection.a },
      b: { ...connection.b },
    })
  }

  return { shapes: clonedShapes, connections: clonedConnections }
}

/**
 * Materialize a buffer into new scene objects: fresh ids, remapped threads,
 * and a world translation so copies don't stack on the originals.
 * Pass `translation` to place relative to free space (slot paste); otherwise
 * use the fixed duplicate offset next to the source selection.
 */
function materializeBuffer(
  buffer: SlotBuffer,
  translation: Vector3Tuple = DUPLICATE_OFFSET,
): {
  shapes: Shape[]
  connections: Connection[]
  newIds: string[]
} {
  const idMap = new Map<string, string>()
  const shapes: Shape[] = buffer.shapes.map((shape) => {
    const newId = createId()
    idMap.set(shape.id, newId)
    return {
      ...shape,
      id: newId,
      vertices: shape.vertices.map((vertex) => [...vertex] as Vector3Tuple),
      edges: shape.edges.map((edge) => [...edge] as [number, number]),
      position: [
        shape.position[0] + translation[0],
        shape.position[1] + translation[1],
        shape.position[2] + translation[2],
      ] as Vector3Tuple,
      quaternion: [...shape.quaternion] as QuatTuple,
    }
  })

  const connections: Connection[] = []
  for (const connection of buffer.connections) {
    const a = remapEndpoint(connection.a, idMap)
    const b = remapEndpoint(connection.b, idMap)
    if (!a || !b) continue
    connections.push({ id: createId(), a, b })
  }

  return { shapes, connections, newIds: shapes.map((shape) => shape.id) }
}

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
  /**
   * Bumped on scene-changing actions so OverlapConnectController re-enables
   * proximity scanning after an idle sleep. Not persisted.
   */
  overlapScanWakeToken: number
  /**
   * Live snackbar status for the overlap scanner (wake cycle count + sleep
   * countdown). Session-only; not persisted.
   */
  overlapScanUi: OverlapScanUi | null
  /**
   * User toggle for the overlap proximity scanner. Persisted across reloads;
   * not reset by undo/redo/load/reset.
   */
  overlapScannerEnabled: boolean
  /**
   * User toggle for fusing closed straw loops into one rigid piece. Persisted
   * across reloads; turn it off to keep every tie floppy. Not reset by
   * undo/redo/load/reset.
   */
  rigidLoopsEnabled: boolean
  /** Shapes currently selected (last id is the primary / gizmo target). */
  selectedShapeIds: string[]
  /** Anchor for Shift+range selection in the sidebar list. */
  selectionAnchorId: string | null
  /** Current edit tool (persisted across reloads; cleared on undo/load/reset). */
  activeTool: ActiveTool
  /**
   * Per-project selection buffers (toolbar 1/2/3). Persisted with the draft and
   * each gallery save so slots follow the open project, not a global clipboard.
   * Occupied slots store a deep clone of shapes + internal connections.
   */
  slots: SlotBuffers
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
  /** Re-enable the overlap proximity scanner after an idle sleep. */
  wakeOverlapScanner: () => void
  /** Turn the overlap proximity scanner on or off (clears HUD when disabling). */
  setOverlapScannerEnabled: (enabled: boolean) => void
  /** Toggle the overlap proximity scanner on/off. */
  toggleOverlapScanner: () => void
  /** Turn rigid-loop fusing on or off (existing fused pieces are left alone). */
  setRigidLoopsEnabled: (enabled: boolean) => void
  /** Toggle rigid-loop fusing on/off. */
  toggleRigidLoops: () => void
  setAnchorY: (y: number) => void
  undo: () => void
  redo: () => void
  addShape: (kind: PrimitiveKind, position?: Vector3Tuple) => string
  removeShape: (id: string) => void
  /**
   * Scissors on one straw of a fused piece: break the piece back into straws,
   * drop that straw, and re-fuse whatever is still a closed loop.
   */
  cutAssemblyEdge: (id: string, edgeIndex: number) => void
  removeShapes: (ids: string[]) => void
  setStrawSize: (size: StrawSize) => void
  setProjectName: (name: string) => void
  selectVertex: (endpoint: EndpointRef) => void
  /** Tie two corners (manual second-click or overlap dwell). Returns true if created. */
  connectEndpoints: (a: EndpointRef, b: EndpointRef) => boolean
  clearPendingVertex: () => void
  setOverlapSuggest: (suggest: OverlapSuggest | null) => void
  setOverlapScanUi: (ui: OverlapScanUi | null) => void
  removeConnection: (id: string) => void
  setShapeTransform: (id: string, position: Vector3Tuple, quaternion: QuatTuple) => void
  moveShape: (id: string, position: Vector3Tuple) => void
  /** Apply multiple position updates in one store write (one overlap-scan wake). */
  moveShapes: (updates: { id: string; position: Vector3Tuple }[]) => void
  selectShape: (id: string | null) => void
  toggleShapeSelection: (id: string) => void
  selectShapeRange: (id: string) => void
  /** Replace the current selection with the given shape ids (last id is primary). */
  selectShapes: (ids: string[]) => void
  duplicateSelection: () => void
  /**
   * Selection buffer slot: store current selection when something is selected,
   * otherwise paste the slot into the scene (no-op if empty).
   */
  useSlotBuffer: (slot: SlotIndex) => void
  setActiveTool: (tool: ActiveTool) => void
  setReelPoses: (
    positions: Record<string, Vector3Tuple>,
    quaternions: Record<string, QuatTuple>,
  ) => void
  finishReelIns: (
    completed: { shapeId: string; position: Vector3Tuple; quaternion: QuatTuple }[],
  ) => void
  reset: () => void
  /** Replace the working draft with a gallery / import snapshot. */
  /** Replace the working design with a saved snapshot (gallery load / import). */
  loadProject: (snapshot: PersistedMobileState & { slots?: SlotBuffers }) => void
  getStrawCounts: () => StrawCounts
}

type SetStrawMobileState = (
  partial: Partial<StrawMobileState> | ((state: StrawMobileState) => Partial<StrawMobileState>),
) => void

/** Safety valve: a fuse can open the next loop, but never loop forever. */
const MAX_FUSE_PASSES = 4

function connectionTouches(connection: Connection, shapeIds: ReadonlySet<string>): boolean {
  return (
    (connection.a.kind === 'shape' && shapeIds.has(connection.a.shapeId)) ||
    (connection.b.kind === 'shape' && shapeIds.has(connection.b.shapeId))
  )
}

/**
 * Replace a closed loop of hand-tied straws with one fused shape.
 *
 * Threads are ball joints, so an N-straw ring is N soft-linked bodies where the
 * toolbar equivalent is a single rigid body — which is exactly why hand-built
 * pyramids wobble. Merging the ring into one shape hands it to the same code
 * path a primitive uses. Returns the fused shape id, or null when the tie only
 * added a floppy branch.
 */
function fuseCycleCluster(
  set: SetStrawMobileState,
  get: () => StrawMobileState,
  newConnection: Connection,
): string | null {
  const state = get()
  const cluster = findFusableCluster(state.shapes, state.connections, newConnection, {
    reelingIds: reelInBodyKeys(state.reelIns),
  })
  if (!cluster) return null

  const members = state.shapes.filter((shape) => cluster.shapeIds.has(shape.id))
  if (members.length !== cluster.shapeIds.size) return null
  const internalConnections = state.connections.filter((connection) =>
    cluster.connectionIds.has(connection.id),
  )

  const fusedId = createId()
  const fused = fuseShapes(members, internalConnections, fusedId)
  if (!fused) return null

  const remapEndpointToFused = (endpoint: EndpointRef): EndpointRef | null => {
    if (endpoint.kind === 'anchor' || !cluster.shapeIds.has(endpoint.shapeId)) return endpoint
    const vertexIndex = fused.vertexMap.get(endpointVertexKey(endpoint))
    if (vertexIndex === undefined) return null
    return { kind: 'shape', shapeId: fusedId, vertexIndex }
  }

  const nextConnections: Connection[] = []
  const seenPairs = new Set<string>()
  for (const connection of state.connections) {
    if (cluster.connectionIds.has(connection.id)) continue
    const a = remapEndpointToFused(connection.a)
    const b = remapEndpointToFused(connection.b)
    if (!a || !b) continue
    // Both ends landing on the fused body would be a joint with itself.
    if (a.kind === 'shape' && b.kind === 'shape' && a.shapeId === b.shapeId) continue
    // Two threads can collapse onto the same corner pair once corners weld.
    const keys = [endpointVertexKey(a), endpointVertexKey(b)].sort()
    const pairKey = `${keys[0]}|${keys[1]}`
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)
    nextConnections.push(a === connection.a && b === connection.b ? connection : { ...connection, a, b })
  }

  const survivingIds = new Set(nextConnections.map((connection) => connection.id))
  const firstMemberIndex = state.shapes.findIndex((shape) => cluster.shapeIds.has(shape.id))
  const nextShapes = state.shapes.filter((shape) => !cluster.shapeIds.has(shape.id))
  nextShapes.splice(
    firstMemberIndex < 0 ? nextShapes.length : firstMemberIndex,
    0,
    fused.shape,
  )

  for (const id of cluster.shapeIds) clearBodyRef(id)

  const nextReelPositions = { ...state.reelPositions }
  const nextReelQuaternions = { ...state.reelQuaternions }
  for (const id of cluster.shapeIds) {
    delete nextReelPositions[id]
    delete nextReelQuaternions[id]
  }

  const touchesCluster = (endpoint: EndpointRef | undefined) =>
    endpoint?.kind === 'shape' && cluster.shapeIds.has(endpoint.shapeId)
  const selectedShapeIds = [
    ...new Set(
      state.selectedShapeIds.map((id) => (cluster.shapeIds.has(id) ? fusedId : id)),
    ),
  ]

  set((current) => ({
    shapes: nextShapes,
    connections: nextConnections,
    reelIns: current.reelIns.filter((reel) => !cluster.shapeIds.has(reel.shapeId)),
    reelPositions: nextReelPositions,
    reelQuaternions: nextReelQuaternions,
    deferredConnectionIds: current.deferredConnectionIds.filter((id) => survivingIds.has(id)),
    pendingVertex: touchesCluster(current.pendingVertex ?? undefined)
      ? null
      : current.pendingVertex,
    overlapSuggest:
      touchesCluster(current.overlapSuggest?.a) || touchesCluster(current.overlapSuggest?.b)
        ? null
        : current.overlapSuggest,
    overlapScanWakeToken: current.overlapScanWakeToken + 1,
    selectedShapeIds,
    selectionAnchorId:
      current.selectionAnchorId && cluster.shapeIds.has(current.selectionAnchorId)
        ? fusedId
        : current.selectionAnchorId,
  }))

  return fusedId
}

/**
 * Fuse every closed loop reachable from the shapes that just moved or got tied.
 * A fused piece can itself close the next loop (a square grown into a pyramid),
 * so freshly fused ids are fed back in. Returns true when anything fused.
 */
function fuseClosedLoopsAround(
  set: SetStrawMobileState,
  get: () => StrawMobileState,
  seedIds: Iterable<string>,
): boolean {
  const seeds = new Set(seedIds)
  if (seeds.size === 0) return false

  let fusedAny = false
  for (let pass = 0; pass < MAX_FUSE_PASSES; pass++) {
    if (!get().rigidLoopsEnabled) break
    const candidates = get().connections.filter((connection) =>
      connectionTouches(connection, seeds),
    )
    let fusedThisPass = 0
    // Candidates consumed by an earlier fuse are simply no longer cycle edges,
    // so a stale entry resolves to null rather than fusing twice.
    for (const candidate of candidates) {
      const fusedId = fuseCycleCluster(set, get, candidate)
      if (!fusedId) continue
      seeds.add(fusedId)
      fusedThisPass += 1
      fusedAny = true
    }
    if (fusedThisPass === 0) break
  }
  return fusedAny
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
    overlapScanUi: null,
    overlapScanWakeToken: get().overlapScanWakeToken + 1,
    ...EMPTY_SELECTION,
    activeTool: 'none',
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
      overlapScanWakeToken: 0,
      overlapScanUi: null,
      overlapScannerEnabled: true,
      rigidLoopsEnabled: true,
      selectedShapeIds: [],
      selectionAnchorId: null,
      activeTool: 'none',
      slots: [...EMPTY_SLOTS],
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

      wakeOverlapScanner: () => {
        set((state) => ({ overlapScanWakeToken: state.overlapScanWakeToken + 1 }))
      },

      setOverlapScannerEnabled: (enabled) => {
        if (get().overlapScannerEnabled === enabled) return
        if (enabled) {
          set((state) => ({
            overlapScannerEnabled: true,
            overlapScanWakeToken: state.overlapScanWakeToken + 1,
          }))
          return
        }
        set({
          overlapScannerEnabled: false,
          overlapSuggest: null,
          overlapScanUi: null,
        })
      },

      toggleOverlapScanner: () => {
        get().setOverlapScannerEnabled(!get().overlapScannerEnabled)
      },

      setRigidLoopsEnabled: (enabled) => {
        if (get().rigidLoopsEnabled === enabled) return
        set({ rigidLoopsEnabled: enabled })
        if (!enabled) return

        // Switching it on also stiffens loops that were tied while it was off
        // (or built before the feature existed) — otherwise the toggle would
        // only ever affect the next thread.
        const { past, future } = get()
        get().pushHistory()
        const fused = fuseClosedLoopsAround(
          set,
          get,
          get().shapes.map((shape) => shape.id),
        )
        if (!fused) set({ past, future })
      },

      toggleRigidLoops: () => {
        get().setRigidLoopsEnabled(!get().rigidLoopsEnabled)
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
          overlapScanWakeToken: state.overlapScanWakeToken + 1,
          // Drop-placed shapes get selected so the gizmo appears immediately;
          // click-to-add (no position) keeps clearing selection as before.
          ...(position !== undefined
            ? {
                selectedShapeIds: [id],
                selectionAnchorId: id,
                activeTool: 'select' as const,
              }
            : EMPTY_SELECTION),
        }))
        return id
      },

      removeShape: (id) => {
        get().removeShapes([id])
      },

      cutAssemblyEdge: (id, edgeIndex) => {
        const assembly = get().shapes.find((shape) => shape.id === id)
        if (!assembly || assembly.kind !== 'assembly' || assembly.edges.length <= 1) {
          get().removeShape(id)
          return
        }

        get().pushHistory()
        const exploded = explodeAssembly(assembly, createId, edgeIndex)
        if (!exploded) {
          get().removeShape(id)
          return
        }

        const state = get()
        const remapEndpoint = (endpoint: EndpointRef): EndpointRef | null => {
          if (endpoint.kind === 'anchor' || endpoint.shapeId !== id) return endpoint
          // A corner left with no straws takes its threads down with it.
          return exploded.endpointByVertex.get(endpoint.vertexIndex) ?? null
        }

        const nextConnections: Connection[] = []
        for (const connection of state.connections) {
          const a = remapEndpoint(connection.a)
          const b = remapEndpoint(connection.b)
          if (!a || !b) continue
          if (a.kind === 'shape' && b.kind === 'shape' && a.shapeId === b.shapeId) continue
          nextConnections.push(
            a === connection.a && b === connection.b ? connection : { ...connection, a, b },
          )
        }
        nextConnections.push(...exploded.connections)

        clearBodyRef(id)
        const nextReelPositions = { ...state.reelPositions }
        const nextReelQuaternions = { ...state.reelQuaternions }
        delete nextReelPositions[id]
        delete nextReelQuaternions[id]

        const assemblyIndex = state.shapes.findIndex((shape) => shape.id === id)
        const nextShapes = state.shapes.filter((shape) => shape.id !== id)
        nextShapes.splice(
          assemblyIndex < 0 ? nextShapes.length : assemblyIndex,
          0,
          ...exploded.shapes,
        )

        const touchesAssembly = (endpoint: EndpointRef | undefined) =>
          endpoint?.kind === 'shape' && endpoint.shapeId === id
        set((current) => ({
          shapes: nextShapes,
          connections: nextConnections,
          reelIns: current.reelIns.filter((reel) => reel.shapeId !== id),
          reelPositions: nextReelPositions,
          reelQuaternions: nextReelQuaternions,
          deferredConnectionIds: current.deferredConnectionIds.filter((deferredId) =>
            nextConnections.some((connection) => connection.id === deferredId),
          ),
          pendingVertex: touchesAssembly(current.pendingVertex ?? undefined)
            ? null
            : current.pendingVertex,
          overlapSuggest:
            touchesAssembly(current.overlapSuggest?.a) ||
            touchesAssembly(current.overlapSuggest?.b)
              ? null
              : current.overlapSuggest,
          overlapScanWakeToken: current.overlapScanWakeToken + 1,
          selectedShapeIds: current.selectedShapeIds.filter(
            (selectedId) => selectedId !== id,
          ),
          selectionAnchorId:
            current.selectionAnchorId === id ? null : current.selectionAnchorId,
        }))

        // Whatever is still a closed loop goes straight back to being rigid.
        fuseClosedLoopsAround(
          set,
          get,
          exploded.shapes.map((shape) => shape.id),
        )
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
        set((state) => ({
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
          overlapScanWakeToken: state.overlapScanWakeToken + 1,
          selectedShapeIds: nextSelected,
          selectionAnchorId:
            selectionAnchorId && removeSet.has(selectionAnchorId) ? null : selectionAnchorId,
        }))
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
            overlapScanWakeToken: state.overlapScanWakeToken + 1,
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

        // A tie that closed a loop becomes one rigid piece. Pieces still reeling
        // are skipped here and retried from finishReelIns once poses land.
        const seedIds: string[] = []
        if (a.kind === 'shape') seedIds.push(a.shapeId)
        if (b.kind === 'shape') seedIds.push(b.shapeId)
        fuseClosedLoopsAround(set, get, seedIds)
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

      setOverlapScanUi: (ui) => {
        const current = get().overlapScanUi
        if (current === ui) return
        if (!current && !ui) return
        if (
          current &&
          ui &&
          current.active === ui.active &&
          current.connectionsFound === ui.connectionsFound &&
          Math.abs(current.sleepProgress - ui.sleepProgress) < 0.01
        ) {
          return
        }
        set({ overlapScanUi: ui })
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
        set((state) => ({
          connections: nextConnections,
          shapes: withSyncedLeavingHanging(shapes, previousHanging, nextHanging),
          reelIns: reelIns.filter((reel) => !touched.has(reel.shapeId)),
          reelPositions: nextReelPositions,
          reelQuaternions: nextReelQuaternions,
          overlapScanWakeToken: state.overlapScanWakeToken + 1,
        }))
      },

      setShapeTransform: (id, position, quaternion) => {
        const current = get().shapes.find((shape) => shape.id === id)
        if (!current) return
        const poseEps = 1e-5
        if (
          Math.abs(current.position[0] - position[0]) < poseEps &&
          Math.abs(current.position[1] - position[1]) < poseEps &&
          Math.abs(current.position[2] - position[2]) < poseEps &&
          Math.abs(current.quaternion[0] - quaternion[0]) < poseEps &&
          Math.abs(current.quaternion[1] - quaternion[1]) < poseEps &&
          Math.abs(current.quaternion[2] - quaternion[2]) < poseEps &&
          Math.abs(current.quaternion[3] - quaternion[3]) < poseEps
        ) {
          return
        }
        // Persistence sync only — do not wake the overlap scanner.
        set((state) => ({
          shapes: state.shapes.map((shape) =>
            shape.id === id ? { ...shape, position, quaternion } : shape,
          ),
        }))
      },

      moveShape: (id, position) => {
        get().moveShapes([{ id, position }])
      },

      moveShapes: (updates) => {
        if (updates.length === 0) return
        const byId = new Map(updates.map((update) => [update.id, update.position]))
        set((state) => ({
          shapes: state.shapes.map((shape) => {
            const position = byId.get(shape.id)
            return position ? { ...shape, position } : shape
          }),
          overlapScanWakeToken: state.overlapScanWakeToken + 1,
        }))
      },

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

      selectShapes: (ids) => {
        if (ids.length === 0) {
          set(EMPTY_SELECTION)
          return
        }
        set({
          selectedShapeIds: ids,
          selectionAnchorId: ids[ids.length - 1] ?? null,
        })
      },

      duplicateSelection: () => {
        const { shapes, connections, selectedShapeIds } = get()
        const buffer = snapshotSelectedBuffer(shapes, connections, selectedShapeIds)
        if (!buffer) return

        get().pushHistory()
        const { shapes: clones, connections: clonedConnections, newIds } =
          materializeBuffer(buffer)

        set((state) => ({
          shapes: [...state.shapes, ...clones],
          connections: [...state.connections, ...clonedConnections],
          selectedShapeIds: newIds,
          selectionAnchorId: newIds[newIds.length - 1] ?? null,
          overlapScanWakeToken: state.overlapScanWakeToken + 1,
        }))
      },

      useSlotBuffer: (slot) => {
        const { shapes, connections, selectedShapeIds, slots } = get()
        if (selectedShapeIds.length > 0) {
          const buffer = snapshotSelectedBuffer(shapes, connections, selectedShapeIds)
          if (!buffer) return
          const nextSlots = [...slots] as StrawMobileState['slots']
          nextSlots[slot] = buffer
          set({ slots: nextSlots })
          return
        }

        const buffer = slots[slot]
        if (!buffer) return

        get().pushHistory()
        // Pull live Rapier poses into the store so free (unconnected) pieces
        // and hanging ones both count as occupied near the look-at.
        syncShapeTransformsFromPhysics()
        const occupiedShapes = get().shapes
        const translation = findGroupAddDelta(occupiedShapes, buffer.shapes)
        const { shapes: clones, connections: clonedConnections } = materializeBuffer(
          buffer,
          translation,
        )

        set((state) => ({
          shapes: [...state.shapes, ...clones],
          connections: [...state.connections, ...clonedConnections],
          // Leave selection empty so another slot click pastes again into new free space.
          ...EMPTY_SELECTION,
          overlapScanWakeToken: state.overlapScanWakeToken + 1,
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
        if (tool === 'none') {
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

        // Corners have met now, so a loop closed by this reel can finally fuse.
        fuseClosedLoopsAround(set, get, completedIds)
      },

      reset: () => {
        get().pushHistory()
        const physicsEpoch = invalidatePhysics(get)
        set((state) => ({
          shapes: [],
          connections: [],
          pendingVertex: null,
          overlapSuggest: null,
          overlapScanUi: null,
          overlapScanWakeToken: state.overlapScanWakeToken + 1,
          ...EMPTY_SELECTION,
          activeTool: 'none',
          slots: [...EMPTY_SLOTS],
          reelIns: [],
          deferredConnectionIds: [],
          reelPositions: {},
          reelQuaternions: {},
          physicsEpoch,
          anchorY: BASE_ANCHOR_Y,
        }))
      },

      loadProject: (snapshot) => {
        get().pushHistory()
        const physicsEpoch = invalidatePhysics(get)
        set((state) => ({
          shapes: snapshot.shapes,
          connections: snapshot.connections,
          strawSize: snapshot.strawSize,
          slots: normalizeSlots(snapshot.slots),
          pendingVertex: null,
          overlapSuggest: null,
          overlapScanUi: null,
          overlapScanWakeToken: state.overlapScanWakeToken + 1,
          ...EMPTY_SELECTION,
          activeTool: 'none',
          reelIns: [],
          deferredConnectionIds: [],
          reelPositions: {},
          reelQuaternions: {},
          physicsEpoch,
          anchorY: BASE_ANCHOR_Y,
        }))
      },

      getStrawCounts: () => computeStrawCounts(get().shapes),
    }),
    {
      name: PERSISTED_STORAGE_KEY,
      version: PERSISTED_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Click-in-progress / selection / reel-in / undo stacks are transient;
      // tool mode prefs (activeTool, scanner, rigid loops) survive reloads.
      partialize: (state): PersistedDraftState => ({
        shapes: state.shapes,
        connections: state.connections,
        strawSize: state.strawSize,
        projectName: state.projectName,
        lastSavedAt: state.lastSavedAt,
        slots: state.slots,
        activeTool: state.activeTool,
        overlapScannerEnabled: state.overlapScannerEnabled,
        rigidLoopsEnabled: state.rigidLoopsEnabled,
      }),
      migrate: (persisted, _version) => {
        const state = persisted as Partial<PersistedDraftState> & { placedCount?: number }
        // Drop legacy workbench slot counter; placement is camera-aware now.
        const { placedCount: _placedCount, ...rest } = state
        return {
          ...rest,
          projectName: rest.projectName ?? DEFAULT_PROJECT_NAME,
          lastSavedAt: rest.lastSavedAt ?? Date.now(),
          slots: normalizeSlots(rest.slots),
          // v5+: restore tool modes; older drafts get defaults.
          activeTool: normalizeActiveTool(rest.activeTool),
          overlapScannerEnabled: rest.overlapScannerEnabled ?? true,
          rigidLoopsEnabled: rest.rigidLoopsEnabled ?? true,
        }
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<PersistedDraftState>
        return {
          ...current,
          ...saved,
          // Never restore in-flight UI animations or undo stacks from storage.
          reelIns: [],
          deferredConnectionIds: [],
          reelPositions: {},
          reelQuaternions: {},
          pendingVertex: null,
          overlapSuggest: null,
          overlapScanUi: null,
          // Wake the scanner after hydrating a saved draft.
          overlapScanWakeToken: current.overlapScanWakeToken + 1,
          ...EMPTY_SELECTION,
          activeTool: normalizeActiveTool(saved.activeTool ?? current.activeTool),
          overlapScannerEnabled: saved.overlapScannerEnabled ?? current.overlapScannerEnabled,
          rigidLoopsEnabled: saved.rigidLoopsEnabled ?? current.rigidLoopsEnabled,
          slots: normalizeSlots(saved.slots),
          past: [],
          future: [],
          physicsEpoch: 0,
          anchorY: BASE_ANCHOR_Y,
        }
      },
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
    state.projectName !== prev.projectName ||
    state.slots !== prev.slots
  if (!designChanged) return
  if (state.lastSavedAt !== prev.lastSavedAt) return
  syncingLastSavedAt = true
  useStrawMobileStore.setState({ lastSavedAt: Date.now() })
  syncingLastSavedAt = false
})
