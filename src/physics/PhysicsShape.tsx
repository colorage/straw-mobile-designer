import { RigidBody } from '@react-three/rapier'
import { useEffect } from 'react'
import { ShapeGroup } from '../scene/ShapeGroup'
import type { Shape } from '../state/types'
import { clearBodyRef, getBodyRef } from './bodyRefRegistry'

/** Wraps a shape in a dynamic rigid body so gravity and joints can move it. */
export function PhysicsShape({ shape }: { shape: Shape }) {
  const ref = getBodyRef(shape.id)

  useEffect(() => () => clearBodyRef(shape.id), [shape.id])

  return (
    <RigidBody
      ref={ref}
      position={shape.position}
      quaternion={shape.quaternion}
      colliders="hull"
      restitution={0.1}
      linearDamping={0.5}
      angularDamping={0.7}
    >
      <ShapeGroup shape={shape} interactive={false} />
    </RigidBody>
  )
}
