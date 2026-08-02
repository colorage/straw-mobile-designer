import { useMemo } from 'react'
import { ANCHOR_POSITION } from '../state/store'
import { useStrawMobileStore } from '../state/store'
import { endpointVertexKey, type Shape } from '../state/types'
import { AnchorPoint } from './AnchorPoint'
import { ConnectionThread } from './ConnectionThread'
import { SelectableShape } from './SelectableShape'
import { VertexHandle } from './VertexHandle'

/** Static (non-physics) scene used while designing: shapes sit on a workbench and every corner is clickable. */
export function BuildScene() {
  const shapes = useStrawMobileStore((s) => s.shapes)
  const connections = useStrawMobileStore((s) => s.connections)
  const pendingVertex = useStrawMobileStore((s) => s.pendingVertex)
  const selectVertex = useStrawMobileStore((s) => s.selectVertex)
  const selectedShapeId = useStrawMobileStore((s) => s.selectedShapeId)

  const shapesById = useMemo(() => {
    const map = new Map<string, Shape>()
    for (const shape of shapes) map.set(shape.id, shape)
    return map
  }, [shapes])

  const connectedVertexKeys = useMemo(() => {
    const set = new Set<string>()
    for (const connection of connections) {
      set.add(endpointVertexKey(connection.a))
      set.add(endpointVertexKey(connection.b))
    }
    return set
  }, [connections])

  return (
    <group>
      <group position={ANCHOR_POSITION}>
        <AnchorPoint />
        <VertexHandle
          position={[0, 0, 0]}
          pending={pendingVertex?.kind === 'anchor'}
          connected={connectedVertexKeys.has('anchor')}
          onSelect={() => selectVertex({ kind: 'anchor' })}
        />
      </group>

      {shapes.map((shape) => (
        <SelectableShape
          key={shape.id}
          shape={shape}
          isSelected={selectedShapeId === shape.id}
          onVertexClick={(vertexIndex) =>
            selectVertex({ kind: 'shape', shapeId: shape.id, vertexIndex })
          }
          isVertexPending={(vertexIndex) =>
            pendingVertex?.kind === 'shape' &&
            pendingVertex.shapeId === shape.id &&
            pendingVertex.vertexIndex === vertexIndex
          }
          isVertexConnected={(vertexIndex) =>
            connectedVertexKeys.has(
              endpointVertexKey({ kind: 'shape', shapeId: shape.id, vertexIndex }),
            )
          }
        />
      ))}

      {connections.map((connection) => (
        <ConnectionThread key={connection.id} connection={connection} shapesById={shapesById} />
      ))}
    </group>
  )
}
