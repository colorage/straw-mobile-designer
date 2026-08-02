import { useMemo } from 'react'
import { getScaledVertex } from '../state/store'
import type { Shape } from '../state/types'
import { StrawMesh } from './StrawMesh'
import { VertexHandle } from './VertexHandle'

interface ShapeGroupProps {
  shape: Shape
  /** Whether corner handles should render and respond to clicks (build mode only). */
  interactive: boolean
  onVertexClick?: (vertexIndex: number) => void
  isVertexPending?: (vertexIndex: number) => boolean
  isVertexConnected?: (vertexIndex: number) => boolean
}

/** Renders a shape's straws plus (optionally) clickable corner handles. */
export function ShapeGroup({
  shape,
  interactive,
  onVertexClick,
  isVertexPending,
  isVertexConnected,
}: ShapeGroupProps) {
  const scaledVertices = useMemo(
    () => shape.vertices.map((_, i) => getScaledVertex(shape, i)),
    [shape],
  )

  return (
    <group>
      {shape.edges.map(([a, b], i) => (
        <StrawMesh key={i} start={scaledVertices[a]} end={scaledVertices[b]} />
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
