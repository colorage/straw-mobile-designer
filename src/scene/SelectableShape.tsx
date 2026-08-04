import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { PivotControls } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import type { Group, Object3D } from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { getFreeComponentIds, getHangingShapeIds } from '../physics/restingLayout'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { ShapeGroup } from './ShapeGroup'

type PointerHandler = (event: ThreeEvent<PointerEvent>) => void

type R3FHandlers = {
  onPointerMove?: PointerHandler
  onPointerOut?: PointerHandler
  onPointerDown?: PointerHandler
  onPointerUp?: PointerHandler
}

type R3FInstance = {
  handlers: R3FHandlers
}

type WrappedPointerHandler = PointerHandler & { __gizmoCursorWrap?: true }

function getR3F(obj: Object3D): R3FInstance | null {
  const instance = (obj as Object3D & { __r3f?: R3FInstance }).__r3f
  return instance ?? null
}

function wrapHandler(base: PointerHandler, wrap: PointerHandler): WrappedPointerHandler {
  const wrapped: WrappedPointerHandler = (event) => {
    wrap(event)
    base(event)
  }
  wrapped.__gizmoCursorWrap = true
  return wrapped
}

/**
 * PivotControls handle roots already own pointer move/down/out for hover+drag.
 * Wrap those handlers to drive grab/grabbing cursors (no cursor API on the gizmo).
 *
 * Re-runs every layout because AxisArrow replaces handlers when hover state
 * changes; skip when our wrapper is already installed.
 */
function useDragGizmoCursor(rootRef: RefObject<Group | null>) {
  const gl = useThree((s) => s.gl)
  const hoveringRef = useRef(false)
  const draggingRef = useRef(false)

  useLayoutEffect(() => {
    const root = rootRef.current
    const canvas = gl.domElement
    if (!root) return

    const setCursor = (cursor: string) => {
      document.body.style.cursor = cursor
      canvas.style.cursor = cursor
    }

    root.traverse((obj) => {
      const r3f = getR3F(obj)
      if (!r3f) return
      const { handlers } = r3f
      // AxisArrow / PlaneSlider both register move + down + out on the handle.
      if (!handlers.onPointerMove || !handlers.onPointerDown || !handlers.onPointerOut) return
      if ((handlers.onPointerMove as WrappedPointerHandler).__gizmoCursorWrap) return

      handlers.onPointerMove = wrapHandler(handlers.onPointerMove, () => {
        hoveringRef.current = true
        if (!draggingRef.current) setCursor('grab')
      })
      handlers.onPointerOut = wrapHandler(handlers.onPointerOut, () => {
        hoveringRef.current = false
        if (!draggingRef.current) setCursor('')
      })
      handlers.onPointerDown = wrapHandler(handlers.onPointerDown, () => {
        draggingRef.current = true
        setCursor('grabbing')
      })
      if (handlers.onPointerUp) {
        handlers.onPointerUp = wrapHandler(handlers.onPointerUp, () => {
          draggingRef.current = false
          setCursor(hoveringRef.current ? 'grab' : '')
        })
      }
    })
  })

  // Clear cursor if this gizmo unmounts while hovered/dragging.
  useLayoutEffect(() => {
    const canvas = gl.domElement
    return () => {
      if (hoveringRef.current || draggingRef.current) {
        hoveringRef.current = false
        draggingRef.current = false
        document.body.style.cursor = ''
        canvas.style.cursor = ''
      }
    }
  }, [gl])

  return {
    beginDrag() {
      draggingRef.current = true
      document.body.style.cursor = 'grabbing'
      gl.domElement.style.cursor = 'grabbing'
    },
    endDrag() {
      draggingRef.current = false
      const next = hoveringRef.current ? 'grab' : ''
      document.body.style.cursor = next
      gl.domElement.style.cursor = next
    },
  }
}

interface SelectableShapeProps {
  shape: Shape
  isSelected: boolean
  /** Only the primary (last) selected free shape mounts the drag gizmo. */
  showGizmo: boolean
  onVertexClick: (vertexIndex: number) => void
  isVertexPending: (vertexIndex: number) => boolean
  isVertexSuggested: (vertexIndex: number) => boolean
  isVertexConnected: (vertexIndex: number) => boolean
}

/**
 * Free workbench shape as a plain Three group (not a RigidBody child).
 *
 * Visuals and PivotControls live outside Rapier so newly added meshes never
 * inherit a stale identity matrixWorld. Pose changes sync into the matching
 * kinematic body so joints/colliders stay aligned.
 */
export function SelectableShape({
  shape,
  isSelected,
  showGizmo,
  onVertexClick,
  isVertexPending,
  isVertexSuggested,
  isVertexConnected,
}: SelectableShapeProps) {
  const selectShape = useStrawMobileStore((s) => s.selectShape)
  const toggleShapeSelection = useStrawMobileStore((s) => s.toggleShapeSelection)
  const removeShape = useStrawMobileStore((s) => s.removeShape)
  const activeTool = useStrawMobileStore((s) => s.activeTool)
  // Remount the gizmo when the selection set changes so frozen offset refreshes.
  const selectionKey = useStrawMobileStore((s) => s.selectedShapeIds.join('|'))
  const isScissors = activeTool === 'scissors'

  const handleBodyClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (isScissors) {
      removeShape(shape.id)
      return
    }
    if (activeTool !== 'select') return
    if (event.nativeEvent.shiftKey) {
      toggleShapeSelection(shape.id)
      return
    }
    selectShape(shape.id)
  }

  const shapeGroup = (
    <ShapeGroup
      shape={shape}
      interactive={activeTool !== 'scissors'}
      onVertexClick={onVertexClick}
      isVertexPending={isVertexPending}
      isVertexSuggested={isVertexSuggested}
      isVertexConnected={isVertexConnected}
      selected={isSelected}
      scissorsHover={isScissors}
      onBodyClick={handleBodyClick}
    />
  )

  if (!showGizmo || activeTool !== 'select') {
    return (
      <group position={shape.position} quaternion={shape.quaternion}>
        {shapeGroup}
      </group>
    )
  }

  return (
    <DragGizmo
      key={selectionKey}
      shapeId={shape.id}
      position={shape.position}
      quaternion={shape.quaternion}
    >
      {shapeGroup}
    </DragGizmo>
  )
}

interface DragGizmoProps {
  shapeId: string
  position: Vector3Tuple
  quaternion: [number, number, number, number]
  children: ReactNode
}

function syncKinematicBody(shapeId: string, position: Vector3Tuple) {
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
function selectionCentroid(primaryPosition: Vector3Tuple): Vector3Tuple {
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
function snapshotDragCohortBases(): Map<string, Vector3Tuple> {
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

  // Primary gizmo target is always included even if selection was cleared mid-gesture.
  const bases = new Map<string, Vector3Tuple>()
  for (const id of cohortIds) {
    const shape = shapeById.get(id)
    if (!shape) continue
    bases.set(id, [...shape.position] as Vector3Tuple)
  }
  return bases
}

/**
 * Translate-only PivotControls gizmo.
 *
 * Freezes position/quaternion at mount (selection time) for the inner group.
 * PivotControls sits untransformed under the scene root; `offset` places the
 * handles at the selection centroid. onDrag matrix `l` is the accumulated
 * world-space translation since mount — adding that to each snapshotted cohort
 * base gives live store positions without double-counting the drag delta that
 * PivotControls already applies imperatively to its subtree.
 */
function DragGizmo({ shapeId, position, quaternion, children }: DragGizmoProps) {
  const moveShapes = useStrawMobileStore((s) => s.moveShapes)
  const pushHistory = useStrawMobileStore((s) => s.pushHistory)
  const basePosition = useRef(position).current
  const baseQuaternion = useRef(quaternion).current
  const offset = useRef(selectionCentroid(position)).current
  const cohortBasesRef = useRef<Map<string, Vector3Tuple>>(new Map())
  const rootRef = useRef<Group>(null)
  const cursor = useDragGizmoCursor(rootRef)

  return (
    <group ref={rootRef}>
      <PivotControls
        disableRotations
        disableScaling
        scale={3.6}
        lineWidth={2.5}
        fixed
        depthTest={false}
        offset={offset}
        onDragStart={() => {
          cursor.beginDrag()
          // One history entry per drag gesture — not per onDrag frame.
          pushHistory()
          const bases = snapshotDragCohortBases()
          // Ensure the gizmo owner is in the cohort even if selection drifted.
          if (!bases.has(shapeId)) {
            bases.set(shapeId, [...basePosition] as Vector3Tuple)
          }
          cohortBasesRef.current = bases
        }}
        onDrag={(l) => {
          // `l` is translation since gizmo mount (same as primary basePosition).
          // Cohort siblings were snapshotted at drag start from the store, so
          // apply the primary's gesture delta rather than the raw mount offset.
          const primaryNext: Vector3Tuple = [
            basePosition[0] + l.elements[12],
            basePosition[1] + l.elements[13],
            basePosition[2] + l.elements[14],
          ]
          const bases = cohortBasesRef.current
          const primaryBase = bases.get(shapeId) ?? basePosition
          const gestureDx = primaryNext[0] - primaryBase[0]
          const gestureDy = primaryNext[1] - primaryBase[1]
          const gestureDz = primaryNext[2] - primaryBase[2]

          const updates: { id: string; position: Vector3Tuple }[] = []
          for (const [id, base] of bases) {
            const next: Vector3Tuple =
              id === shapeId
                ? primaryNext
                : [base[0] + gestureDx, base[1] + gestureDy, base[2] + gestureDz]
            updates.push({ id, position: next })
            syncKinematicBody(id, next)
          }
          moveShapes(updates)
        }}
        onDragEnd={() => {
          cursor.endDrag()
        }}
      >
        <group position={basePosition} quaternion={baseQuaternion}>
          {children}
        </group>
      </PivotControls>
    </group>
  )
}
