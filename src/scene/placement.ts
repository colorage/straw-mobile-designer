import * as THREE from 'three'
import {
  PRIMITIVE_GENERATORS,
  type PrimitiveKind,
  type Vector3Tuple,
} from '../geometry/primitives'
import { getBodyRef } from '../physics/bodyRefRegistry'
import type { Shape, StrawSize } from '../state/types'
import { getCameraView } from './cameraView'

/** Must match `BASE_STRAW_LENGTH` in store.ts (kept local to avoid a store ↔ placement cycle). */
const BASE_STRAW_LENGTH = 1.4
const OVERLAP_PADDING = 0.4
const NDC_MARGIN = 0.75
const SPIRAL_STEP = 0.55
const MAX_SPIRAL_STEPS = 64
const EMPTY_SCENE_Y_OFFSET = -0.8

interface Aabb {
  min: THREE.Vector3
  max: THREE.Vector3
}

const _local = new THREE.Vector3()
const _world = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _ndc = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _candidate = new THREE.Vector3()

function scaledLocalVertex(shape: Pick<Shape, 'vertices' | 'size'>, vertexIndex: number): THREE.Vector3 {
  const scale = shape.size * BASE_STRAW_LENGTH
  const [x, y, z] = shape.vertices[vertexIndex]
  return _local.set(x * scale, y * scale, z * scale)
}

/**
 * Resolve the pose used for occupancy / bounds.
 * Live Rapier pose when available so hanging AND free (unconnected) bodies
 * occupy their on-screen space; otherwise the store pose.
 */
function readPoseForAabb(shape: Shape, useLivePose: boolean): void {
  if (useLivePose) {
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
          _pos.set(t.x, t.y, t.z)
          _quat.set(r.x, r.y, r.z, r.w)
          return
        }
      } catch {
        // Body may have been freed; fall through to store pose.
      }
    }
  }
  _quat.set(...shape.quaternion)
  _pos.set(...shape.position)
}

/**
 * World-space axis-aligned bounds of a shape's vertices.
 * @param useLivePose Prefer the live physics body pose (default true) so free
 *   workbench pieces and swaying hanging pieces both count as occupied.
 *   Pass false for buffer snapshots whose ids may still refer to other bodies.
 */
export function shapeWorldAabb(shape: Shape, useLivePose = true): Aabb {
  readPoseForAabb(shape, useLivePose)

  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)

  for (let i = 0; i < shape.vertices.length; i++) {
    _world.copy(scaledLocalVertex(shape, i)).applyQuaternion(_quat).add(_pos)
    min.min(_world)
    max.max(_world)
  }

  return { min, max }
}

/** Local AABB of a brand-new primitive at the given straw size (identity rotation). */
function newShapeLocalAabb(kind: PrimitiveKind, size: StrawSize): Aabb {
  const { vertices } = PRIMITIVE_GENERATORS[kind]()
  const scale = size * BASE_STRAW_LENGTH
  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)

  for (const [x, y, z] of vertices) {
    _local.set(x * scale, y * scale, z * scale)
    min.min(_local)
    max.max(_local)
  }

  return { min, max }
}

function translateAabb(local: Aabb, position: THREE.Vector3): Aabb {
  return {
    min: local.min.clone().add(position),
    max: local.max.clone().add(position),
  }
}

function aabbsOverlap(a: Aabb, b: Aabb, padding: number): boolean {
  return (
    a.min.x - padding <= b.max.x &&
    a.max.x + padding >= b.min.x &&
    a.min.y - padding <= b.max.y &&
    a.max.y + padding >= b.min.y &&
    a.min.z - padding <= b.max.z &&
    a.max.z + padding >= b.min.z
  )
}

function isInCameraView(point: THREE.Vector3, camera: THREE.Camera): boolean {
  _ndc.copy(point).project(camera)
  if (_ndc.z < -1 || _ndc.z > 1) return false
  return Math.abs(_ndc.x) <= NDC_MARGIN && Math.abs(_ndc.y) <= NDC_MARGIN
}

function viewBasis(camera: THREE.Camera | null, target: THREE.Vector3) {
  if (camera) {
    _forward.subVectors(target, camera.position)
    if (_forward.lengthSq() < 1e-8) {
      camera.getWorldDirection(_forward)
    } else {
      _forward.normalize()
    }
  } else {
    _forward.set(0, 0, -1)
  }

  _up.set(0, 1, 0)
  _right.crossVectors(_forward, _up)
  if (_right.lengthSq() < 1e-8) {
    _up.set(0, 0, 1)
    _right.crossVectors(_forward, _up)
  }
  _right.normalize()
  _up.crossVectors(_right, _forward).normalize()

  return { right: _right, up: _up }
}

/**
 * Pick a workbench position for `localAabb` (relative to the placement point)
 * that stays in the current camera view and does not overlap occupied bounds.
 * Falls back to the nearest clear candidate if nothing lands fully in-frustum.
 */
function findFreeSpacePosition(occupied: Aabb[], localAabb: Aabb): Vector3Tuple {
  const { camera, target } = getCameraView()
  const { right, up } = viewBasis(camera, target)

  const origin = target.clone()
  if (occupied.length === 0) {
    origin.y += EMPTY_SCENE_Y_OFFSET
  }

  let fallback: THREE.Vector3 | null = null

  for (let step = 0; step < MAX_SPIRAL_STEPS; step++) {
    if (step === 0 && occupied.length === 0) {
      _candidate.copy(origin)
    } else {
      // Archimedean spiral on the camera-facing plane so later adds fan out beside content.
      const index = occupied.length === 0 ? step : step + 1
      const radius = SPIRAL_STEP * Math.sqrt(index)
      const angle = index * 2.399963 // golden angle
      _candidate
        .copy(origin)
        .addScaledVector(right, Math.cos(angle) * radius)
        .addScaledVector(up, Math.sin(angle) * radius)
    }

    const candidateAabb = translateAabb(localAabb, _candidate)
    const overlaps = occupied.some((aabb) => aabbsOverlap(candidateAabb, aabb, OVERLAP_PADDING))
    if (overlaps) continue

    if (!fallback) {
      fallback = _candidate.clone()
    }

    if (!camera || isInCameraView(_candidate, camera)) {
      return [_candidate.x, _candidate.y, _candidate.z]
    }
  }

  if (fallback) {
    return [fallback.x, fallback.y, fallback.z]
  }

  // Last resort: offset past the union of occupied bounds along camera-right.
  if (occupied.length > 0) {
    const unionMaxX = Math.max(...occupied.map((a) => a.max.x))
    const extent = Math.max(localAabb.max.x - localAabb.min.x, 1)
    _candidate.copy(origin).addScaledVector(right, unionMaxX - origin.x + extent + OVERLAP_PADDING)
    return [_candidate.x, _candidate.y, _candidate.z]
  }

  return [origin.x, origin.y, origin.z]
}

/**
 * Pick a workbench position that stays in the current camera view and does not
 * overlap existing shapes. Falls back to the nearest clear candidate if nothing
 * lands fully in-frustum.
 */
export function findAddPosition(
  shapes: Shape[],
  kind: PrimitiveKind,
  size: StrawSize,
): Vector3Tuple {
  // Live poses so free workbench shapes occupy space the same as hanging ones.
  return findFreeSpacePosition(
    shapes.map((shape) => shapeWorldAabb(shape, true)),
    newShapeLocalAabb(kind, size),
  )
}

function unionAabb(aabbs: Aabb[]): Aabb | null {
  if (aabbs.length === 0) return null
  const min = aabbs[0].min.clone()
  const max = aabbs[0].max.clone()
  for (let i = 1; i < aabbs.length; i++) {
    min.min(aabbs[i].min)
    max.max(aabbs[i].max)
  }
  return { min, max }
}

/**
 * Translation that moves `groupShapes` into free space near the camera look-at
 * (same spiral / frustum logic as adding a straw), preserving relative layout.
 *
 * Occupancy uses live poses of every scene shape — hanging (connected) and free
 * (unconnected) — so a second paste does not land on the first. Group bounds
 * always use the buffer's stored poses (ids may still point at other bodies).
 */
export function findGroupAddDelta(occupiedShapes: Shape[], groupShapes: Shape[]): Vector3Tuple {
  if (groupShapes.length === 0) return [0, 0, 0]

  // Buffer snapshots keep source ids; never read those bodies for group bounds.
  const groupAabbs = groupShapes.map((shape) => shapeWorldAabb(shape, false))
  const union = unionAabb(groupAabbs)
  if (!union) return [0, 0, 0]

  const center = new THREE.Vector3(
    (union.min.x + union.max.x) * 0.5,
    (union.min.y + union.max.y) * 0.5,
    (union.min.z + union.max.z) * 0.5,
  )
  const localAabb: Aabb = {
    min: union.min.clone().sub(center),
    max: union.max.clone().sub(center),
  }

  const occupied = occupiedShapes.map((shape) => shapeWorldAabb(shape, true))
  const [x, y, z] = findFreeSpacePosition(occupied, localAabb)
  return [x - center.x, y - center.y, z - center.z]
}
