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
import { ReelInController } from './ReelInController'
import { reelInBodyKeys } from './reelIn'

const GROUND_Y = -6

/**
 * Fixed Rapier body for the ceiling hook — collider-less joint anchor only.
 * Visuals render as a plain scene group so they never inherit a stale
 * RigidBody matrixWorld.
 */
function FixedAnchorBody() {
  const ref = getBodyRef('anchor')
  return <RigidBody ref={ref} type="fixed" position={ANCHOR_POSITION} colliders={false} />
}

function CeilingHookVisual() {
  const pendingVertex = useStrawMobileStore((s) => s.pendingVertex)
  const connections = useStrawMobileStore((s) => s.connections)
  const selectVertex = useStrawMobileStore((s) => s.selectVertex)
  const activeTool = useStrawMobileStore((s) => s.activeTool)

  const connected = useMemo(
    () => connections.some((c) => c.a.kind === 'anchor' || c.b.kind === 'anchor'),
    [connections],
  )

  return (
    <group position={ANCHOR_POSITION}>
      <AnchorPoint />
      {activeTool !== 'scissors' && (
        <VertexHandle
          position={[0, 0, 0]}
          pending={pendingVertex?.kind === 'anchor'}
          connected={connected}
          onSelect={() => selectVertex({ kind: 'anchor' })}
        />
      )}
    </group>
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
 *
 * Visuals / gizmos for free shapes are plain Three groups (SelectableShape);
 * hanging visuals are driven from Rapier each frame. RigidBodies only own
 * colliders so mount-time matrixWorld bugs cannot hide geometry.
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

  const reelIns = useStrawMobileStore((s) => s.reelIns ?? [])
  const hangingIds = useMemo(() => getHangingShapeIds(connections), [connections])
  const reelingIds = useMemo(() => reelInBodyKeys(reelIns), [reelIns])

  const connectedVertexKeys = useMemo(() => {
    const set = new Set<string>()
    for (const connection of connections) {
      set.add(endpointVertexKey(connection.a))
      set.add(endpointVertexKey(connection.b))
    }
    return set
  }, [connections])

  return (
    <Physics gravity={[0, -9.81, 0]} updatePriority={-1}>
      <FixedAnchorBody />
      <CeilingHookVisual />
      <ReelInController />
      {shapes.map((shape) => (
        <PhysicsShape
          key={shape.id}
          shape={shape}
          hanging={hangingIds.has(shape.id)}
          reeling={reelingIds.has(shape.id)}
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
