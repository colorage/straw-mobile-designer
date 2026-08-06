import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { getBodyRef } from './bodyRefRegistry'
import { pointerToCameraPlane } from '../scene/cameraPlane'
import { beginGizmoDrag, endGizmoDrag } from '../scene/gizmoDrag'
import type { Vector3Tuple } from '../geometry/primitives'

/** Soft spring pull toward the mouse — strong enough to feel responsive, soft enough to respect joints. */
const GRAB_STIFFNESS = 90
const GRAB_DAMPING = 14
/** Cap force magnitude so a long chain cannot explode under a far mouse pull. */
const MAX_FORCE = 120

export type PhysicsGrabSession = {
  shapeId: string
  /** Local-space grab anchor on the body. */
  localAnchor: Vector3Tuple
  /** Camera-plane origin (world) frozen at drag start. */
  planePoint: THREE.Vector3
  /** Live world target the spring pulls toward. */
  target: THREE.Vector3
}

let grab: PhysicsGrabSession | null = null

const _worldAnchor = new THREE.Vector3()
const _force = new THREE.Vector3()
const _r = new THREE.Vector3()
const _ang = new THREE.Vector3()
const _vel = new THREE.Vector3()
const _quat = new THREE.Quaternion()

export function getPhysicsGrab(): PhysicsGrabSession | null {
  return grab
}

export function isPhysicsGrabbing(): boolean {
  return grab !== null
}

export function beginPhysicsGrab(args: {
  shapeId: string
  localAnchor: Vector3Tuple
  planePoint: THREE.Vector3
  clientX: number
  clientY: number
  camera: THREE.Camera
  canvas: HTMLCanvasElement
}): boolean {
  const body = getBodyRef(args.shapeId).current
  if (!body) return false

  const hit = pointerToCameraPlane(
    args.clientX,
    args.clientY,
    args.planePoint,
    args.camera,
    args.canvas,
    new THREE.Vector3(),
  )
  if (!hit) return false

  try {
    body.wakeUp()
  } catch {
    return false
  }

  beginGizmoDrag()
  grab = {
    shapeId: args.shapeId,
    localAnchor: [...args.localAnchor] as Vector3Tuple,
    planePoint: args.planePoint.clone(),
    target: hit.clone(),
  }
  return true
}

export function updatePhysicsGrabTarget(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): void {
  if (!grab) return
  const hit = pointerToCameraPlane(
    clientX,
    clientY,
    grab.planePoint,
    camera,
    canvas,
    new THREE.Vector3(),
  )
  if (!hit) return
  grab.target.copy(hit)
}

export function endPhysicsGrab(): void {
  if (!grab) return
  grab = null
  endGizmoDrag()
}

function readWorldAnchor(body: RapierRigidBody, local: Vector3Tuple, out: THREE.Vector3): boolean {
  try {
    const t = body.translation()
    const r = body.rotation()
    _quat.set(r.x, r.y, r.z, r.w)
    out.set(local[0], local[1], local[2]).applyQuaternion(_quat)
    out.x += t.x
    out.y += t.y
    out.z += t.z
    return true
  } catch {
    return false
  }
}

/**
 * Apply a spring-damper force at the grab anchor toward the mouse target.
 * Call once per frame before the Rapier step (default useFrame priority is fine
 * when Physics updatePriority is -1).
 */
export function applyPhysicsGrabForces(): void {
  if (!grab) return
  const body = getBodyRef(grab.shapeId).current
  if (!body) return

  if (!readWorldAnchor(body, grab.localAnchor, _worldAnchor)) return

  try {
    const lin = body.linvel()
    const ang = body.angvel()
    const t = body.translation()
    _r.set(_worldAnchor.x - t.x, _worldAnchor.y - t.y, _worldAnchor.z - t.z)
    _ang.set(ang.x, ang.y, ang.z)
    // v_point = v + ω × r
    _vel.set(
      lin.x + (_ang.y * _r.z - _ang.z * _r.y),
      lin.y + (_ang.z * _r.x - _ang.x * _r.z),
      lin.z + (_ang.x * _r.y - _ang.y * _r.x),
    )

    _force.set(
      (grab.target.x - _worldAnchor.x) * GRAB_STIFFNESS - _vel.x * GRAB_DAMPING,
      (grab.target.y - _worldAnchor.y) * GRAB_STIFFNESS - _vel.y * GRAB_DAMPING,
      (grab.target.z - _worldAnchor.z) * GRAB_STIFFNESS - _vel.z * GRAB_DAMPING,
    )

    const mag = _force.length()
    if (mag > MAX_FORCE) _force.multiplyScalar(MAX_FORCE / mag)

    body.wakeUp()
    body.addForceAtPoint(_force, _worldAnchor, true)
  } catch {
    // Body may have been freed mid-grab.
  }
}
