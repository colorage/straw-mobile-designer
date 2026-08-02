import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'
import { AnchorPoint } from '../scene/AnchorPoint'
import { ConnectionThread } from '../scene/ConnectionThread'
import { VertexHandle } from '../scene/VertexHandle'
import { ANCHOR_POSITION, useStrawMobileStore } from '../state/store'
import { endpointVertexKey, type Shape } from '../state/types'
import { getBodyRef } from './bodyRefRegistry'
import { ENVIRONMENT_COLLISION_GROUPS } from './collisionGroups'
import { getHangingShapeIds } from './restingLayout'
import { JointsLayer } from './JointsLayer'
import { PhysicsShape } from './PhysicsShape'

const GROUND_Y = -6

// The anchor is never removed for the lifetime of the app, so its ref never
// needs explicit cleanup (see PhysicsShape.tsx for why cleanup-on-unmount is
// avoided in the first place).
function FixedAnchorBody() {
  const ref = getBodyRef('anchor')
  const pendingVertex = useStrawMobileStore((s) => s.pendingVertex)
  const connections = useStrawMobileStore((s) => s.connections)
  const selectVertex = useStrawMobileStore((s) => s.selectVertex)

  const connected = useMemo(
    () => connections.some((c) => c.a.kind === 'anchor' || c.b.kind === 'anchor'),
    [connections],
  )

  return (
    <RigidBody ref={ref} type="fixed" position={ANCHOR_POSITION} colliders={false}>
      <AnchorPoint />
      <VertexHandle
        position={[0, 0, 0]}
        pending={pendingVertex?.kind === 'anchor'}
        connected={connected}
        onSelect={() => selectVertex({ kind: 'anchor' })}
      />
    </RigidBody>
  )
}

/** Invisible safety-net floor so a hanging piece that somehow detaches has somewhere to land. */
function GroundBody() {
  return (
    <RigidBody type="fixed" position={[0, GROUND_Y, 0]} colliders={false}>
      <CuboidCollider args={[40, 0.5, 40]} collisionGroups={ENVIRONMENT_COLLISION_GROUPS} />
    </RigidBody>
  )
}

/**
 * Unified edit + gravity scene: free shapes stay kinematic on the workbench;
 * shapes in the hook-rooted connection chain are dynamic and hang on joints.
 */
export function PhysicsScene() {
  const shapes = useStrawMobileStore((s) => s.shapes)
  const connections = useStrawMobileStore((s) => s.connections)
  const pendingVertex = useStrawMobileStore((s) => s.pendingVertex)
  const selectVertex = useStrawMobileStore((s) => s.selectVertex)

  const shapesById = useMemo(() => {
    const map = new Map<string, Shape>()
    for (const shape of shapes) map.set(shape.id, shape)
    return map
  }, [shapes])

  const hangingIds = useMemo(() => getHangingShapeIds(connections), [connections])

  const connectedVertexKeys = useMemo(() => {
    const set = new Set<string>()
    for (const connection of connections) {
      set.add(endpointVertexKey(connection.a))
      set.add(endpointVertexKey(connection.b))
    }
    return set
  }, [connections])

  return (
    <Physics gravity={[0, -9.81, 0]}>
      <FixedAnchorBody />
      {shapes.map((shape) => (
        <PhysicsShape
          key={shape.id}
          shape={shape}
          hanging={hangingIds.has(shape.id)}
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
      <JointsLayer connections={connections} />
      {connections.map((connection) => (
        <ConnectionThread key={connection.id} connection={connection} shapesById={shapesById} />
      ))}
      <GroundBody />
    </Physics>
  )
}
