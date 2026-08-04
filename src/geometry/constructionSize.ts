import * as THREE from 'three'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { BASE_STRAW_LENGTH } from '../state/shapeSpace'
import type { QuatTuple, Shape } from '../state/types'

/** Real-world length of one solid (size-1) straw. */
export const SOLID_STRAW_LENGTH_CM = 20

/** World units → centimeters: a solid straw is `BASE_STRAW_LENGTH` units long. */
const CM_PER_WORLD_UNIT = SOLID_STRAW_LENGTH_CM / BASE_STRAW_LENGTH

export type ConstructionSizeCm = {
  /** Larger horizontal AABB span (X or Z), in cm. */
  widthCm: number
  /** Vertical AABB span (Y), in cm. */
  heightCm: number
}

const _local = new THREE.Vector3()
const _world = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _pos = new THREE.Vector3()

function readLivePose(shape: Shape): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const body = getBodyRef(shape.id).current
  if (body) {
    try {
      const t = body.translation()
      const r = body.rotation()
      if (
        Number.isFinite(t.x) &&
        Number.isFinite(t.y) &&
        Number.isFinite(t.z) &&
        Number.isFinite(r.x) &&
        Number.isFinite(r.y) &&
        Number.isFinite(r.z) &&
        Number.isFinite(r.w)
      ) {
        return {
          position: _pos.set(t.x, t.y, t.z),
          quaternion: _quat.set(r.x, r.y, r.z, r.w),
        }
      }
    } catch {
      // Body may have been freed between frames; fall through to store pose.
    }
  }
  const q = shape.quaternion as QuatTuple
  return {
    position: _pos.set(...shape.position),
    quaternion: _quat.set(q[0], q[1], q[2], q[3]),
  }
}

/**
 * Axis-aligned width × height of the full straw construction in centimeters.
 * Width is the larger horizontal span; height is the vertical span.
 * Returns null when there are no shapes.
 */
export function computeConstructionSizeCm(shapes: Shape[]): ConstructionSizeCm | null {
  if (shapes.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (const shape of shapes) {
    const scale = shape.size * BASE_STRAW_LENGTH
    const { position, quaternion } = readLivePose(shape)

    for (let i = 0; i < shape.vertices.length; i++) {
      const [x, y, z] = shape.vertices[i]
      _world.copy(_local.set(x * scale, y * scale, z * scale)).applyQuaternion(quaternion).add(position)
      if (_world.x < minX) minX = _world.x
      if (_world.y < minY) minY = _world.y
      if (_world.z < minZ) minZ = _world.z
      if (_world.x > maxX) maxX = _world.x
      if (_world.y > maxY) maxY = _world.y
      if (_world.z > maxZ) maxZ = _world.z
    }
  }

  if (!Number.isFinite(minX)) return null

  const widthWorld = Math.max(maxX - minX, maxZ - minZ)
  const heightWorld = maxY - minY

  return {
    widthCm: widthWorld * CM_PER_WORLD_UNIT,
    heightCm: heightWorld * CM_PER_WORLD_UNIT,
  }
}

/** Format a centimeter value without noisy trailing zeros (e.g. 20, 12.5). */
export function formatCm(value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return String(parseFloat(rounded.toFixed(1)))
}
