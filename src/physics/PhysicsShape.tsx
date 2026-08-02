import { RigidBody } from '@react-three/rapier'
import { ShapeGroup } from '../scene/ShapeGroup'
import type { Shape } from '../state/types'
import { getBodyRef } from './bodyRefRegistry'

/**
 * Wraps a shape in a dynamic rigid body so gravity and joints can move it.
 *
 * Note: deliberately no unmount cleanup of the body ref here. In development,
 * React StrictMode double-invokes effect cleanup/setup on mount without
 * actually unmounting — clearing the shared ref registry entry there would
 * orphan the very ref this RigidBody is using, breaking joints. The registry
 * is cleaned up instead when a shape is actually removed (see store.ts).
 */
export function PhysicsShape({ shape }: { shape: Shape }) {
  const ref = getBodyRef(shape.id)

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
