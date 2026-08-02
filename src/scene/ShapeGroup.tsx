import { useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { getScaledVertex } from '../state/shapeSpace'
import type { Shape } from '../state/types'
import { StrawMesh } from './StrawMesh'
import { VertexHandle } from './VertexHandle'

const STRAW_COLOR = '#dcc186'
const STRAW_COLOR_SELECTED = '#8fb8ff'

interface ShapeGroupProps {
  shape: Shape
  /** Whether corner handles should render and respond to clicks. */
  interactive: boolean
  onVertexClick?: (vertexIndex: number) => void
  isVertexPending?: (vertexIndex: number) => boolean
  isVertexConnected?: (vertexIndex: number) => boolean
  /** Tints the straws to indicate this shape is picked up for dragging. */
  selected?: boolean
  /** Click handler on the straw bodies (not the corner handles), used to pick a shape up for dragging. */
  onBodyClick?: (event: ThreeEvent<MouseEvent>) => void
}

/** Renders a shape's straws plus (optionally) clickable corner handles. */
export function ShapeGroup({
  shape,
  interactive,
  onVertexClick,
  isVertexPending,
  isVertexConnected,
  selected,
  onBodyClick,
}: ShapeGroupProps) {
  const scaledVertices = useMemo(
    () => shape.vertices.map((_, i) => getScaledVertex(shape, i)),
    [shape],
  )

  return (
    <group onClick={onBodyClick}>
      {shape.edges.map(([a, b], i) => (
        <StrawMesh
          key={i}
          start={scaledVertices[a]}
          end={scaledVertices[b]}
          color={selected ? STRAW_COLOR_SELECTED : STRAW_COLOR}
        />
      ))}
      {interactive &&
        scaledVertices.map((vertex, i) => (
          <VertexHandle
            key={i}
            position={vertex}
            pending={isVertexPending?.(i)}
            connected={isVertexConnected?.(i)}
            onSelect={() => onVertexClick?.(i)}
          />
        ))}
    </group>
  )
}
