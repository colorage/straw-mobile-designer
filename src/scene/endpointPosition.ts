import * as THREE from 'three'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { ANCHOR_POSITION, getScaledVertex } from '../state/shapeSpace'
import type { EndpointRef, Shape } from '../state/types'

/**
 * World-space position of a connection endpoint. Prefers the live Rapier pose
 * when a body exists so threads track hanging pieces; falls back to the store
 * transform for anything not yet in the physics world.
 */
export function getEndpointWorldPosition(
  endpoint: EndpointRef,
  shapesById: Map<string, Shape>,
): THREE.Vector3 | null {
  if (endpoint.kind === 'anchor') {
    const body = getBodyRef('anchor').current
    if (body) {
      const t = body.translation()
      return new THREE.Vector3(t.x, t.y, t.z)
    }
    return new THREE.Vector3(...ANCHOR_POSITION)
  }

  const shape = shapesById.get(endpoint.shapeId)
  if (!shape) return null

  const [lx, ly, lz] = getScaledVertex(shape, endpoint.vertexIndex)
  const body = getBodyRef(endpoint.shapeId).current
  if (body) {
    const t = body.translation()
    const r = body.rotation()
    return new THREE.Vector3(lx, ly, lz)
      .applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w))
      .add(new THREE.Vector3(t.x, t.y, t.z))
  }

  const rotation = new THREE.Quaternion(...shape.quaternion)
  return new THREE.Vector3(lx, ly, lz)
    .applyQuaternion(rotation)
    .add(new THREE.Vector3(...shape.position))
}
