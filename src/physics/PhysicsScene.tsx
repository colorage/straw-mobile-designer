import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { useEffect } from 'react'
import { AnchorPoint } from '../scene/AnchorPoint'
import { ANCHOR_POSITION, useStrawMobileStore } from '../state/store'
import { clearBodyRef, getBodyRef } from './bodyRefRegistry'
import { JointsLayer } from './JointsLayer'
import { PhysicsShape } from './PhysicsShape'

const GROUND_Y = -6

function FixedAnchorBody() {
  const ref = getBodyRef('anchor')
  useEffect(() => () => clearBodyRef('anchor'), [])

  return (
    <RigidBody ref={ref} type="fixed" position={ANCHOR_POSITION}>
      <AnchorPoint />
    </RigidBody>
  )
}

/** Invisible safety-net floor so any not-yet-connected piece has somewhere to land. */
function GroundBody() {
  return (
    <RigidBody type="fixed" position={[0, GROUND_Y, 0]} colliders={false}>
      <CuboidCollider args={[40, 0.5, 40]} />
    </RigidBody>
  )
}

/** Live gravity simulation: every shape becomes a dynamic rigid body, every connection a ball joint. */
export function PhysicsScene() {
  const shapes = useStrawMobileStore((s) => s.shapes)
  const connections = useStrawMobileStore((s) => s.connections)

  return (
    <Physics gravity={[0, -9.81, 0]}>
      <FixedAnchorBody />
      {shapes.map((shape) => (
        <PhysicsShape key={shape.id} shape={shape} />
      ))}
      <JointsLayer connections={connections} />
      <GroundBody />
    </Physics>
  )
}
