import { useMemo, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { getScaledVertex } from '../state/shapeSpace'
import type { Shape } from '../state/types'
import { StrawMesh } from './StrawMesh'
import { VertexHandle } from './VertexHandle'
import { setMoveCursor } from './freeMoveDrag'
import { isGizmoDragging } from './gizmoDrag'

const STRAW_COLOR = '#dcc186'
const STRAW_COLOR_SELECTED = '#8fb8ff'
const STRAW_COLOR_SCISSORS_HOVER = '#e08a8a'
const STRAW_COLOR_MOVE_TARGET = '#b8d4ff'

interface ShapeGroupProps {
  shape: Shape
  /** Whether corner handles should render and respond to clicks. */
  interactive: boolean
  onVertexClick?: (vertexIndex: number) => void
  isVertexPending?: (vertexIndex: number) => boolean
  isVertexSuggested?: (vertexIndex: number) => boolean
  isVertexConnected?: (vertexIndex: number) => boolean
  /** Corner is the active move/grab subtarget. */
  isVertexMoveTarget?: (vertexIndex: number) => boolean
  /** Straw is the active move/grab subtarget. */
  isEdgeMoveTarget?: (edgeIndex: number) => boolean
  /** Tints the straws to indicate this shape is picked up for dragging. */
  selected?: boolean
  /** Soft cut-mode hover tint when the scissors tool is active. */
  scissorsHover?: boolean
  /** Click handler on the straw bodies (not the corner handles), used to pick a shape up for dragging. */
  onBodyClick?: (event: ThreeEvent<MouseEvent>) => void
  /**
   * Click handler for one straw. Used by scissors (cut) and select mode (straw subselection).
   */
  onEdgeClick?: (edgeIndex: number) => void
  /** Pointer-down on a move-target corner — starts free/physics drag. */
  onVertexDragStart?: (vertexIndex: number, event: ThreeEvent<PointerEvent>) => void
  /** Pointer-down on a move-target straw — starts free/physics drag. */
  onEdgeDragStart?: (edgeIndex: number, event: ThreeEvent<PointerEvent>) => void
}

/** Renders a shape's straws plus (optionally) clickable corner handles. */
export function ShapeGroup({
  shape,
  interactive,
  onVertexClick,
  isVertexPending,
  isVertexSuggested,
  isVertexConnected,
  isVertexMoveTarget,
  isEdgeMoveTarget,
  selected,
  scissorsHover,
  onBodyClick,
  onEdgeClick,
  onVertexDragStart,
  onEdgeDragStart,
}: ShapeGroupProps) {
  const [hovered, setHovered] = useState(false)
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null)
  const scaledVertices = useMemo(
    () => shape.vertices.map((_, i) => getScaledVertex(shape, i)),
    [shape],
  )

  const color = selected
    ? STRAW_COLOR_SELECTED
    : scissorsHover && hovered && !onEdgeClick
      ? STRAW_COLOR_SCISSORS_HOVER
      : STRAW_COLOR

  const edgeColor = (edgeIndex: number) => {
    if (isEdgeMoveTarget?.(edgeIndex)) return STRAW_COLOR_MOVE_TARGET
    if (!selected && scissorsHover && onEdgeClick && hoveredEdge === edgeIndex) {
      return STRAW_COLOR_SCISSORS_HOVER
    }
    return color
  }

  return (
    <group
      userData={{ selectableShapeId: shape.id }}
      onClick={onBodyClick}
      onPointerOver={
        scissorsHover
          ? (event) => {
              event.stopPropagation()
              setHovered(true)
            }
          : undefined
      }
      onPointerOut={
        scissorsHover
          ? () => {
              setHovered(false)
            }
          : undefined
      }
    >
      {shape.edges.map(([a, b], i) => {
        const straw = (
          <StrawMesh start={scaledVertices[a]} end={scaledVertices[b]} color={edgeColor(i)} />
        )
        const moveTarget = !!isEdgeMoveTarget?.(i)
        if (!onEdgeClick && !onEdgeDragStart) return <group key={i}>{straw}</group>
        return (
          <group
            key={i}
            onClick={(event) => {
              event.stopPropagation()
              onEdgeClick?.(i)
            }}
            onPointerDown={
              moveTarget && onEdgeDragStart
                ? (event) => {
                    onEdgeDragStart(i, event)
                  }
                : undefined
            }
            onPointerOver={(event) => {
              event.stopPropagation()
              setHoveredEdge(i)
              if (moveTarget && !isGizmoDragging()) setMoveCursor(true)
            }}
            onPointerOut={() => {
              setHoveredEdge((current) => (current === i ? null : current))
              if (moveTarget) setMoveCursor(false)
            }}
          >
            {straw}
          </group>
        )
      })}
      {interactive &&
        scaledVertices.map((vertex, i) => (
          <VertexHandle
            key={i}
            position={vertex}
            pending={isVertexPending?.(i)}
            suggested={isVertexSuggested?.(i)}
            connected={isVertexConnected?.(i)}
            moveTarget={isVertexMoveTarget?.(i)}
            onSelect={() => onVertexClick?.(i)}
            onDragStart={
              onVertexDragStart ? (event) => onVertexDragStart(i, event) : undefined
            }
          />
        ))}
    </group>
  )
}
