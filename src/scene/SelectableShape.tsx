import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { PivotControls } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Raycaster, Vector2, type Group, type Mesh, type Object3D } from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { getFreeComponentIds, getHangingShapeIds } from '../physics/restingLayout'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { ShapeGroup } from './ShapeGroup'

/**
 * PivotControls hit volumes: invisible cylinders on axes, translucent planes
 * on sliders. Skip vertex-handle spheres and visible straw cylinders.
 */
function isGizmoHitMesh(obj: Object3D): obj is Mesh {
  if (!(obj as Mesh).isMesh) return false
  const geoType = (obj as Mesh).geometry?.type
  if (geoType === 'CylinderGeometry' && obj.visible === false) return true
  if (geoType === 'PlaneGeometry') return true
  return false
}

function collectGizmoHitMeshes(root: Object3D | null): Object3D[] {
  if (!root) return []
  const meshes: Object3D[] = []
  root.traverse((obj) => {
    if (isGizmoHitMesh(obj)) meshes.push(obj)
  })
  return meshes
}

/**
 * Shows a grab cursor over translation gizmo handles (grabbing while dragged).
 * PivotControls has no cursor prop and stops pointer bubbling, so we raycast
 * its invisible hit meshes instead of relying on parent pointer events.
 */
function useDragGizmoCursor(rootRef: RefObject<Group | null>) {
  const gl = useThree((s) => s.gl)
  const get = useThree((s) => s.get)
  const hitMeshesRef = useRef<Object3D[]>([])
  const hoveringRef = useRef(false)
  const draggingRef = useRef(false)
  const pointerNdc = useRef(new Vector2())
  const raycaster = useRef(new Raycaster()).current

  useLayoutEffect(() => {
    hitMeshesRef.current = collectGizmoHitMeshes(rootRef.current)
  })

  useEffect(() => {
    const canvas = gl.domElement

    const setCursor = (cursor: string) => {
      document.body.style.cursor = cursor
      canvas.style.cursor = cursor
    }

    const clearIfOurs = () => {
      if (hoveringRef.current || draggingRef.current) {
        hoveringRef.current = false
        draggingRef.current = false
        setCursor('')
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (draggingRef.current) {
        setCursor('grabbing')
        return
      }

      // Remount / late gizmo children: refresh if we haven't found hits yet.
      if (hitMeshesRef.current.length === 0) {
        hitMeshesRef.current = collectGizmoHitMeshes(rootRef.current)
      }
      if (hitMeshesRef.current.length === 0) return

      const { camera } = get()
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      pointerNdc.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointerNdc.current, camera)
      // fixed PivotControls mutates gizmo scale every frame — refresh matrices.
      for (const mesh of hitMeshesRef.current) {
        mesh.updateWorldMatrix(true, false)
      }
      const overGizmo = raycaster.intersectObjects(hitMeshesRef.current, false).length > 0

      if (overGizmo) {
        hoveringRef.current = true
        setCursor('grab')
      } else if (hoveringRef.current) {
        // Only reset when we previously claimed the cursor — leave vertex
        // handles and other hover cursors alone.
        hoveringRef.current = false
        setCursor('')
      }
    }

    const onPointerLeave = () => {
      if (draggingRef.current) return
      if (hoveringRef.current) {
        hoveringRef.current = false
        setCursor('')
      }
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      clearIfOurs()
    }
  }, [gl, get, raycaster, rootRef])

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
