import { useRef, type ReactNode } from 'react'
import { PivotControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { Vector3Tuple } from '../geometry/primitives'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { getHangingShapeIds } from '../physics/restingLayout'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { ShapeGroup } from './ShapeGroup'

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
  // Remount the gizmo when the selection set changes so frozen bases/offset refresh.
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

/** Snapshot free selected shapes' poses and their centroid at gizmo mount. */
function freezeSelectionDrag(primaryId: string, primaryPosition: Vector3Tuple) {
  const { shapes, selectedShapeIds, connections } = useStrawMobileStore.getState()
  const hanging = getHangingShapeIds(connections)
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const bases = new Map<string, Vector3Tuple>()

  for (const id of selectedShapeIds) {
    if (hanging.has(id)) continue
    const shape = shapesById.get(id)
    if (shape) bases.set(id, shape.position)
  }
  if (!bases.has(primaryId)) bases.set(primaryId, primaryPosition)

  let sx = 0
  let sy = 0
  let sz = 0
  for (const [x, y, z] of bases.values()) {
    sx += x
    sy += y
    sz += z
  }
  const n = bases.size
  const offset: Vector3Tuple = n > 0 ? [sx / n, sy / n, sz / n] : primaryPosition

  return { bases, offset }
}

/**
 * Translate-only PivotControls gizmo.
 *
 * Freezes position/quaternion at mount (selection time) for the inner group.
 * PivotControls sits untransformed under the scene root; `offset` places the
 * handles at the selection centroid. onDrag matrix `l` is the accumulated
 * world-space translation since mount — adding that to each frozen base
 * position gives live store positions without double-counting the drag delta
 * that PivotControls already applies imperatively to its subtree.
 */
function DragGizmo({ shapeId, position, quaternion, children }: DragGizmoProps) {
  const moveShapes = useStrawMobileStore((s) => s.moveShapes)
  const pushHistory = useStrawMobileStore((s) => s.pushHistory)
  const { bases, offset } = useRef(freezeSelectionDrag(shapeId, position)).current
  const basePosition = bases.get(shapeId) ?? position
  const baseQuaternion = useRef(quaternion).current

  return (
    <PivotControls
      disableRotations
      disableScaling
      scale={3.6}
      lineWidth={2.5}
      fixed
      depthTest={false}
      offset={offset}
      onDragStart={() => {
        // One history entry per drag gesture — not per onDrag frame.
        pushHistory()
      }}
      onDrag={(l) => {
        const dx = l.elements[12]
        const dy = l.elements[13]
        const dz = l.elements[14]
        const next: Record<string, Vector3Tuple> = {}
        for (const [id, base] of bases) {
          const pos: Vector3Tuple = [base[0] + dx, base[1] + dy, base[2] + dz]
          next[id] = pos
          syncKinematicBody(id, pos)
        }
        moveShapes(next)
      }}
    >
      <group position={basePosition} quaternion={baseQuaternion}>
        {children}
      </group>
    </PivotControls>
  )
}
