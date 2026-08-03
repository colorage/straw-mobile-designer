import { useRef, type ReactNode } from 'react'
import { PivotControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { Vector3Tuple } from '../geometry/primitives'
import { getBodyRef } from '../physics/bodyRefRegistry'
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
  const isScissors = activeTool === 'scissors'

  const handleBodyClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (isScissors) {
      removeShape(shape.id)
      return
    }
    if (event.nativeEvent.shiftKey) {
      toggleShapeSelection(shape.id)
      return
    }
    selectShape(shape.id)
  }

  const shapeGroup = (
    <ShapeGroup
      shape={shape}
      interactive={!isScissors}
      onVertexClick={onVertexClick}
      isVertexPending={isVertexPending}
      isVertexSuggested={isVertexSuggested}
      isVertexConnected={isVertexConnected}
      selected={isSelected}
      scissorsHover={isScissors}
      onBodyClick={handleBodyClick}
    />
  )

  if (!showGizmo || isScissors) {
    return (
      <group position={shape.position} quaternion={shape.quaternion}>
        {shapeGroup}
      </group>
    )
  }

  return (
    <DragGizmo shapeId={shape.id} position={shape.position} quaternion={shape.quaternion}>
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

/**
 * Translate-only PivotControls gizmo.
 *
 * Freezes position/quaternion at mount (selection time) for the inner group.
 * PivotControls sits untransformed under the scene root, so its onDrag matrix
 * `l` is the accumulated world-space translation since mount — adding that to
 * basePosition gives the live store position without double-counting the drag
 * delta that PivotControls already applies imperatively to its subtree.
 */
function DragGizmo({ shapeId, position, quaternion, children }: DragGizmoProps) {
  const moveShape = useStrawMobileStore((s) => s.moveShape)
  const pushHistory = useStrawMobileStore((s) => s.pushHistory)
  const basePosition = useRef(position).current
  const baseQuaternion = useRef(quaternion).current

  return (
    <PivotControls
      disableRotations
      disableScaling
      scale={0.9}
      lineWidth={2.5}
      fixed
      depthTest={false}
      onDragStart={() => {
        // One history entry per drag gesture — not per onDrag frame.
        pushHistory()
      }}
      onDrag={(l) => {
        const next: Vector3Tuple = [
          basePosition[0] + l.elements[12],
          basePosition[1] + l.elements[13],
          basePosition[2] + l.elements[14],
        ]
        moveShape(shapeId, next)
        syncKinematicBody(shapeId, next)
      }}
    >
      <group position={basePosition} quaternion={baseQuaternion}>
        {children}
      </group>
    </PivotControls>
  )
}
