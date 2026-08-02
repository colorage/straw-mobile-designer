import * as THREE from 'three'
import { ANCHOR_POSITION, getScaledVertex } from '../state/store'
import type { EndpointRef, Shape } from '../state/types'

/** World-space position of a connection endpoint, using each shape's build-mode transform. */
export function getEndpointWorldPosition(
  endpoint: EndpointRef,
  shapesById: Map<string, Shape>,
): THREE.Vector3 | null {
  if (endpoint.kind === 'anchor') {
    return new THREE.Vector3(...ANCHOR_POSITION)
  }

  const shape = shapesById.get(endpoint.shapeId)
  if (!shape) return null

  const [x, y, z] = getScaledVertex(shape, endpoint.vertexIndex)
  const rotation = new THREE.Quaternion(...shape.quaternion)
  return new THREE.Vector3(x, y, z).applyQuaternion(rotation).add(new THREE.Vector3(...shape.position))
}
