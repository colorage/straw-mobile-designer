import { RigidBody } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Group } from 'three'
import { SelectableShape } from '../scene/SelectableShape'
import { ShapeGroup } from '../scene/ShapeGroup'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { getBodyRef } from './bodyRefRegistry'
import { SHAPE_COLLISION_GROUPS } from './collisionGroups'
import { registerMeshDriver } from './meshDriveRegistry'

/** Gentle nudge so a freshly hanging piece sways instead of sitting perfectly still. */
function nudgeHangingBody(body: {
  wakeUp: () => void
  mass: () => number
  applyImpulse: (impulse: { x: number; y: number; z: number }, wake: boolean) => void
  applyTorqueImpulse: (torque: { x: number; y: number; z: number }, wake: boolean) => void
  setLinvel: (vel: { x: number; y: number; z: number }, wake: boolean) => void
  setAngvel: (vel: { x: number; y: number; z: number }, wake: boolean) => void
}) {
  body.wakeUp()
  const angle = Math.random() * Math.PI * 2
  const speed = 0.55 + Math.random() * 0.35
  const linvel = {
    x: Math.cos(angle) * speed,
    y: 0.02,
    z: Math.sin(angle) * speed,
  }
  const angvel = {
    x: (Math.random() - 0.5) * 0.35,
    y: (Math.random() - 0.5) * 0.2,
    z: (Math.random() - 0.5) * 0.35,
  }

  // Prefer impulses when the hull colliders gave the body real mass; otherwise
  // set velocities directly so a zero-mass body still visibly starts swinging.
  const mass = body.mass()
  if (mass > 1e-4) {
    body.applyImpulse(
      {
        x: linvel.x * mass * 0.55,
        y: linvel.y * mass * 0.55,
        z: linvel.z * mass * 0.55,
      },
      true,
    )
    body.applyTorqueImpulse(
      {
        x: angvel.x * mass * 0.08,
        y: angvel.y * mass * 0.08,
        z: angvel.z * mass * 0.08,
      },
      true,
    )
  } else {
    body.setLinvel(linvel, true)
    body.setAngvel(angvel, true)
  }
}

interface PhysicsShapeProps {
  shape: Shape
  /** True when this shape is in the hook-rooted hanging chain (dynamic under gravity). */
  hanging: boolean
  /** True while a thread reel-in is sliding this body — stays kinematic until done. */
  reeling: boolean
  onVertexClick: (vertexIndex: number) => void
  isVertexPending: (vertexIndex: number) => boolean
  isVertexConnected: (vertexIndex: number) => boolean
}

/**
 * Driven visual for hanging / reeling shapes — a plain scene group that follows
 * the Rapier body (and reel pose) each frame. Keeping meshes outside RigidBody
 * avoids the stale-identity-matrixWorld bug that hid newly mounted children.
 */
function DrivenShapeVisual({
  shape,
  onVertexClick,
  isVertexPending,
  isVertexConnected,
}: Omit<PhysicsShapeProps, 'hanging' | 'reeling'>) {
  const groupRef = useRef<Group>(null)

  useLayoutEffect(() => {
    return registerMeshDriver(shape.id, (position) => {
      groupRef.current?.position.set(position[0], position[1], position[2])
    })
  }, [shape.id])

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    const reelPosition = useStrawMobileStore.getState().reelPositions[shape.id]
    if (reelPosition) {
      group.position.set(reelPosition[0], reelPosition[1], reelPosition[2])
      group.quaternion.set(
        shape.quaternion[0],
        shape.quaternion[1],
        shape.quaternion[2],
        shape.quaternion[3],
      )
      return
    }

    const body = getBodyRef(shape.id).current
    if (!body) return
    try {
      const t = body.translation()
      const r = body.rotation()
      group.position.set(t.x, t.y, t.z)
      group.quaternion.set(r.x, r.y, r.z, r.w)
    } catch {
      // Body may have been freed between frames.
    }
  })

  return (
    <group ref={groupRef} position={shape.position} quaternion={shape.quaternion}>
      <ShapeGroup
        shape={shape}
        interactive
        onVertexClick={onVertexClick}
        isVertexPending={isVertexPending}
        isVertexConnected={isVertexConnected}
      />
    </group>
  )
}

/**
 * Every shape owns a rigid body for joints/colliders. Visuals and edit gizmos
 * live as sibling plain Three groups so free pieces never mount under a
 * stationary kinematic/fixed body (the PR #6 matrixWorld regression).
 *
 * Note: deliberately no unmount cleanup of the body ref here. In development,
 * React StrictMode double-invokes effect cleanup/setup on mount without
 * actually unmounting — clearing the shared ref registry entry there would
 * orphan the very ref this RigidBody is using, breaking joints. The registry
 * is cleaned up instead when a shape is actually removed (see store.ts).
 */
export function PhysicsShape({
  shape,
  hanging,
  reeling,
  onVertexClick,
  isVertexPending,
  isVertexConnected,
}: PhysicsShapeProps) {
  const ref = getBodyRef(shape.id)
  const isSelected = useStrawMobileStore((s) => s.selectedShapeId === shape.id)
  const reelPosition = useStrawMobileStore((s) => s.reelPositions[shape.id])
  const isDynamic = hanging && !reeling
  const isFree = !hanging && !reeling
  const worldPosition = reelPosition ?? shape.position
  const wasDynamicRef = useRef(false)

  // When a shape first becomes dynamic (joins the hook chain / finishes reel-in),
  // give it a small impulse so gravity motion is obvious after the resting snap.
  useEffect(() => {
    if (!isDynamic) {
      wasDynamicRef.current = false
      return
    }
    if (wasDynamicRef.current) return

    let attempts = 0
    let frameId = 0
    let cancelled = false
    const tryNudge = () => {
      if (cancelled) return
      const body = ref.current
      if (body) {
        try {
          // Wait until auto-colliders have attached so mass > 0 and impulses work.
          if (body.numColliders() === 0 && attempts < 20) {
            attempts += 1
            frameId = requestAnimationFrame(tryNudge)
            return
          }
          nudgeHangingBody(body)
          wasDynamicRef.current = true
          return
        } catch {
          // Body may not be ready for impulses yet.
        }
      }
      attempts += 1
      if (attempts < 24) frameId = requestAnimationFrame(tryNudge)
    }
    frameId = requestAnimationFrame(tryNudge)
    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [isDynamic, ref])

  return (
    <>
      <RigidBody
        ref={ref}
        type={isDynamic ? 'dynamic' : 'kinematicPosition'}
        position={worldPosition}
        quaternion={shape.quaternion}
        colliders="hull"
        // Hull meshes live in a hidden group so they don't double-draw; Rapier
        // skips invisible children unless this flag is set (otherwise mass=0).
        includeInvisible
        // Thin straw hulls have tiny volume; scale density so total mass is
        // numerically stable under joints (~1–2 for a full-size octahedron).
        density={400}
        collisionGroups={SHAPE_COLLISION_GROUPS}
        canSleep={false}
        restitution={0.1}
        linearDamping={0.4}
        angularDamping={0.55}
      >
        {/* Hull source only — not rendered / not raycast-visible. */}
        <group visible={false}>
          <ShapeGroup shape={shape} interactive={false} />
        </group>
      </RigidBody>

      {isFree ? (
        <SelectableShape
          shape={shape}
          isSelected={isSelected}
          onVertexClick={onVertexClick}
          isVertexPending={isVertexPending}
          isVertexConnected={isVertexConnected}
        />
      ) : (
        <DrivenShapeVisual
          shape={shape}
          onVertexClick={onVertexClick}
          isVertexPending={isVertexPending}
          isVertexConnected={isVertexConnected}
        />
      )}
    </>
  )
}
