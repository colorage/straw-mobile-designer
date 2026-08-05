import { useMemo, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { getScaledVertex } from '../state/shapeSpace'
import type { Shape } from '../state/types'
import { StrawMesh } from './StrawMesh'
import { VertexHandle } from './VertexHandle'

const STRAW_COLOR = '#dcc186'
const STRAW_COLOR_SELECTED = '#8fb8ff'
const STRAW_COLOR_SCISSORS_HOVER = '#e08a8a'

interface ShapeGroupProps {
  shape: Shape
  /** Whether corner handles should render and respond to clicks. */
  interactive: boolean
  onVertexClick?: (vertexIndex: number) => void
  isVertexPending?: (vertexIndex: number) => boolean
  isVertexSuggested?: (vertexIndex: number) => boolean
  isVertexConnected?: (vertexIndex: number) => boolean
  /** Tints the straws to indicate this shape is picked up for dragging. */
  selected?: boolean
  /** Soft cut-mode hover tint when the scissors tool is active. */
  scissorsHover?: boolean
  /** Click handler on the straw bodies (not the corner handles), used to pick a shape up for dragging. */
  onBodyClick?: (event: ThreeEvent<MouseEvent>) => void
  /**
   * Click handler for one straw. Fused pieces use this so scissors cuts the
   * straw under the cursor instead of the whole piece; the hover tint follows
   * that single straw too.
   */
  onEdgeClick?: (edgeIndex: number) => void
}

/** Renders a shape's straws plus (optionally) clickable corner handles. */
export function ShapeGroup({
  shape,
  interactive,
  onVertexClick,
  isVertexPending,
  isVertexSuggested,
  isVertexConnected,
  selected,
  scissorsHover,
  onBodyClick,
  onEdgeClick,
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

  const edgeColor = (edgeIndex: number) =>
    !selected && scissorsHover && onEdgeClick && hoveredEdge === edgeIndex
      ? STRAW_COLOR_SCISSORS_HOVER
      : color

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
        if (!onEdgeClick) return <group key={i}>{straw}</group>
        return (
          <group
            key={i}
            onClick={(event) => {
              event.stopPropagation()
              onEdgeClick(i)
            }}
            onPointerOver={(event) => {
              event.stopPropagation()
              setHoveredEdge(i)
            }}
            onPointerOut={() => {
              setHoveredEdge((current) => (current === i ? null : current))
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
            onSelect={() => onVertexClick?.(i)}
          />
        ))}
    </group>
  )
}
