import * as THREE from 'three'
import {
  PRIMITIVE_GENERATORS,
  type ShapeKind,
  type Vector3Tuple,
} from '../geometry/primitives'
import type { Shape, StrawSize } from '../state/types'
import { getCameraView } from './cameraView'

/** Must match `BASE_STRAW_LENGTH` in store.ts (kept local to avoid a store ↔ placement cycle). */
const BASE_STRAW_LENGTH = 1.4
const OVERLAP_PADDING = 0.4
const NDC_MARGIN = 0.75
const SPIRAL_STEP = 0.55
const MAX_SPIRAL_STEPS = 48
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

/** World-space axis-aligned bounds of a shape's vertices. */
export function shapeWorldAabb(shape: Shape): Aabb {
  _quat.set(...shape.quaternion)
  _pos.set(...shape.position)

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
function newShapeLocalAabb(kind: ShapeKind, size: StrawSize): Aabb {
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
 * Pick a workbench position that stays in the current camera view and does not
 * overlap existing shapes. Falls back to the nearest clear candidate if nothing
 * lands fully in-frustum.
 */
export function findAddPosition(shapes: Shape[], kind: ShapeKind, size: StrawSize): Vector3Tuple {
  const { camera, target } = getCameraView()
  const localAabb = newShapeLocalAabb(kind, size)
  const occupied = shapes.map(shapeWorldAabb)
  const { right, up } = viewBasis(camera, target)

  const origin = target.clone()
  if (shapes.length === 0) {
    origin.y += EMPTY_SCENE_Y_OFFSET
  }

  let fallback: THREE.Vector3 | null = null

  for (let step = 0; step < MAX_SPIRAL_STEPS; step++) {
    if (step === 0 && shapes.length === 0) {
      _candidate.copy(origin)
    } else {
      // Archimedean spiral on the camera-facing plane so later adds fan out beside content.
      const index = shapes.length === 0 ? step : step + 1
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
