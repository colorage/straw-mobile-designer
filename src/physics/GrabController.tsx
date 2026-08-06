import { useFrame } from '@react-three/fiber'
import { applyPhysicsGrabForces } from './physicsGrab'

/**
 * Applies soft spring forces for an active hanging grab each frame.
 * Runs at default useFrame priority (0); Physics uses updatePriority={-1},
 * so forces land before the Rapier step.
 */
export function GrabController() {
  useFrame(() => {
    applyPhysicsGrabForces()
  })
  return null
}
