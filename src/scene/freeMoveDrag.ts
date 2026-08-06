import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { getFreeComponentIds, getHangingShapeIds } from '../physics/restingLayout'
import { getScaledVertex } from '../state/shapeSpace'
import { useStrawMobileStore } from '../state/store'
import type { EndpointRef, SelectedEdge, Shape } from '../state/types'
import { beginGizmoDrag, endGizmoDrag } from './gizmoDrag'
import { pointerToCameraPlane } from './cameraPlane'

export type FreeMoveGrabKind = 'centroid' | 'vertex' | 'edge'

export type FreeMoveSession = {
  kind: FreeMoveGrabKind
  primaryShapeId: string
  /** World-space plane origin at drag start (grab point). */
  planePoint: THREE.Vector3
  startHit: THREE.Vector3
  cohortBases: Map<string, Vector3Tuple>
}

let session: FreeMoveSession | null = null

/** Active free (kinematic) camera-plane drag, if any. */
export function getFreeMoveSession(): FreeMoveSession | null {
  return session
}

export function isFreeMoving(): boolean {
  return session !== null
}

export function syncKinematicBody(shapeId: string, position: Vector3Tuple): void {
  const body = getBodyRef(shapeId).current
  if (!body) return
  try {
    body.wakeUp()
    body.setNextKinematicTranslation({ x: position[0], y: position[1], z: position[2] })
    body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true)
  } catch {
    // Body may have been removed mid-drag.
  }
}

/** World-space centroid of currently selected free shapes (fallback: primary). */
export function selectionCentroid(primaryPosition: Vector3Tuple): Vector3Tuple {
  const { shapes, selectedShapeIds, connections } = useStrawMobileStore.getState()
  const hanging = getHangingShapeIds(connections)
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))

  let sx = 0
  let sy = 0
  let sz = 0
  let n = 0
  for (const id of selectedShapeIds) {
    if (hanging.has(id)) continue
    const shape = shapesById.get(id)
    if (!shape) continue
    sx += shape.position[0]
    sy += shape.position[1]
    sz += shape.position[2]
    n += 1
  }
  if (n === 0) return primaryPosition
  return [sx / n, sy / n, sz / n]
}

/**
 * Free selected shapes plus free thread-connected neighbors (not hanging).
 * Snapshot positions at drag start so every cohort member shares one delta.
 */
export function snapshotDragCohortBases(primaryShapeId?: string): Map<string, Vector3Tuple> {
  const { shapes, connections, selectedShapeIds } = useStrawMobileStore.getState()
  const hanging = getHangingShapeIds(connections)
  const shapeById = new Map(shapes.map((shape) => [shape.id, shape]))
  const cohortIds = new Set<string>()

  for (const seedId of selectedShapeIds) {
    if (!shapeById.has(seedId) || hanging.has(seedId)) continue
    for (const id of getFreeComponentIds(connections, seedId)) {
      if (!shapeById.has(id) || hanging.has(id)) continue
      cohortIds.add(id)
    }
  }

  const bases = new Map<string, Vector3Tuple>()
  for (const id of cohortIds) {
    const shape = shapeById.get(id)
    if (!shape) continue
    bases.set(id, [...shape.position] as Vector3Tuple)
  }

  if (primaryShapeId && !bases.has(primaryShapeId)) {
    const shape = shapeById.get(primaryShapeId)
    if (shape && !hanging.has(primaryShapeId)) {
      bases.set(primaryShapeId, [...shape.position] as Vector3Tuple)
    }
  }
  return bases
}

/** Local-space grab point for a corner or straw midpoint. */
export function localGrabPoint(
  shape: Shape,
  endpoint: EndpointRef | null,
  edge: SelectedEdge | null,
): Vector3Tuple {
  if (endpoint?.kind === 'shape' && endpoint.shapeId === shape.id) {
    return getScaledVertex(shape, endpoint.vertexIndex)
  }
  if (edge && edge.shapeId === shape.id) {
    const [a, b] = shape.edges[edge.edgeIndex] ?? [0, 0]
    const va = getScaledVertex(shape, a)
    const vb = getScaledVertex(shape, b)
    return [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]
  }
  return [0, 0, 0]
}

/** World-space grab point from a shape's store pose (free / kinematic). */
export function worldGrabFromStorePose(
  shape: Shape,
  local: Vector3Tuple,
): THREE.Vector3 {
  const quat = new THREE.Quaternion(
    shape.quaternion[0],
    shape.quaternion[1],
    shape.quaternion[2],
    shape.quaternion[3],
  )
  return new THREE.Vector3(local[0], local[1], local[2])
    .applyQuaternion(quat)
    .add(new THREE.Vector3(...shape.position))
}

/**
 * Start a free camera-plane drag for a free (non-hanging) cohort.
 * Returns false when there is nothing movable.
 */
export function beginFreeMoveDrag(args: {
  kind: FreeMoveGrabKind
  primaryShapeId: string
  planePoint: THREE.Vector3
  clientX: number
  clientY: number
  camera: THREE.Camera
  canvas: HTMLCanvasElement
}): boolean {
  const bases = snapshotDragCohortBases(args.primaryShapeId)
  if (bases.size === 0) return false

  const hit = pointerToCameraPlane(
    args.clientX,
    args.clientY,
    args.planePoint,
    args.camera,
    args.canvas,
    new THREE.Vector3(),
  )
  if (!hit) return false

  useStrawMobileStore.getState().pushHistory()
  beginGizmoDrag()
  session = {
    kind: args.kind,
    primaryShapeId: args.primaryShapeId,
    planePoint: args.planePoint.clone(),
    startHit: hit.clone(),
    cohortBases: bases,
  }
  return true
}

/** Apply pointer motion to the active free-move session. */
export function updateFreeMoveDrag(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): void {
  if (!session) return
  const hit = pointerToCameraPlane(
    clientX,
    clientY,
    session.planePoint,
    camera,
    canvas,
    new THREE.Vector3(),
  )
  if (!hit) return

  const dx = hit.x - session.startHit.x
  const dy = hit.y - session.startHit.y
  const dz = hit.z - session.startHit.z

  const updates: { id: string; position: Vector3Tuple }[] = []
  for (const [id, base] of session.cohortBases) {
    const next: Vector3Tuple = [base[0] + dx, base[1] + dy, base[2] + dz]
    updates.push({ id, position: next })
    syncKinematicBody(id, next)
  }
  useStrawMobileStore.getState().moveShapes(updates)
}

export function endFreeMoveDrag(): void {
  if (!session) return
  session = null
  endGizmoDrag()
}

/** Set body/canvas cursor to the 4-arrow move cursor (or clear). */
export function setMoveCursor(active: boolean, dragging = false): void {
  const next = dragging ? 'move' : active ? 'move' : ''
  document.body.style.cursor = next
}
