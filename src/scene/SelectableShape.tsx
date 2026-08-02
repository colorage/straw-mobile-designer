import { useRef, type ReactNode } from 'react'
import { PivotControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { Vector3Tuple } from '../geometry/primitives'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { ShapeGroup } from './ShapeGroup'

interface SelectableShapeProps {
  shape: Shape
  isSelected: boolean
  onVertexClick: (vertexIndex: number) => void
  isVertexPending: (vertexIndex: number) => boolean
  isVertexConnected: (vertexIndex: number) => boolean
}

/**
 * A build-mode shape that can be picked up and dragged around the workbench.
 *
 * Clicking a straw body selects the shape; clicking a corner handle instead
 * ties/unties thread (VertexHandle already stops propagation). Once selected,
 * the shape is wrapped in a translate-only PivotControls gizmo.
 */
export function SelectableShape({
  shape,
  isSelected,
  onVertexClick,
  isVertexPending,
  isVertexConnected,
}: SelectableShapeProps) {
  const selectShape = useStrawMobileStore((s) => s.selectShape)

  const handleBodyClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    selectShape(shape.id)
  }

  const shapeGroup = (
    <ShapeGroup
      shape={shape}
      interactive
      onVertexClick={onVertexClick}
      isVertexPending={isVertexPending}
      isVertexConnected={isVertexConnected}
      selected={isSelected}
      onBodyClick={handleBodyClick}
    />
  )

  if (!isSelected) {
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
      onDrag={(l) => {
        moveShape(shapeId, [
          basePosition[0] + l.elements[12],
          basePosition[1] + l.elements[13],
          basePosition[2] + l.elements[14],
        ])
      }}
    >
      <group position={basePosition} quaternion={baseQuaternion}>
        {children}
      </group>
    </PivotControls>
  )
}
