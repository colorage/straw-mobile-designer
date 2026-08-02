import type { RapierRigidBody } from '@react-three/rapier'
import type { RefObject } from 'react'

/**
 * Plain module-level registry of stable RefObjects, keyed by shape id (or
 * 'anchor'). Living outside React context lets both the physics tree (which
 * attaches these refs to <RigidBody>) and UI code outside the <Canvas />
 * (which needs to read final transforms when stopping the simulation) share
 * the exact same ref instances.
 */
const registry = new Map<string, RefObject<RapierRigidBody>>()

export function getBodyRef(key: string): RefObject<RapierRigidBody> {
  let ref = registry.get(key)
  if (!ref) {
    ref = { current: null } as unknown as RefObject<RapierRigidBody>
    registry.set(key, ref)
  }
  return ref
}

export function clearBodyRef(key: string): void {
  registry.delete(key)
}
