import { RigidBody } from '@react-three/rapier'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Group } from 'three'
import { SelectableShape } from '../scene/SelectableShape'
import { ShapeGroup } from '../scene/ShapeGroup'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { getBodyRef } from './bodyRefRegistry'
import { SHAPE_COLLISION_GROUPS } from './collisionGroups'
import { registerMeshDriver } from './meshDriveRegistry'
import { getHangingShapeIds } from './restingLayout'

const ZERO_VEL = { x: 0, y: 0, z: 0 }
/** Skip settle impulse when this body or the hanging chain is already moving. */
const ALREADY_MOVING_SPEED = 0.08
/** Mild horizontal sway so a newly hung piece doesn't sit perfectly still. */
const SETTLE_SPEED = 0.12
/**
 * Once this many shapes already hang, skip the settle kick entirely —
 * extra impulses resonate through multi-spoke / long-chain joints.
 */
const SETTLE_IMPULSE_MAX_HANGING = 2

function bodySpeed(body: {
  linvel: () => { x: number; y: number; z: number }
  angvel: () => { x: number; y: number; z: number }
}): number {
  try {
    const v = body.linvel()
    const w = body.angvel()
    return Math.max(Math.hypot(v.x, v.y, v.z), Math.hypot(w.x, w.y, w.z))
  } catch {
    return 0
  }
}

/** True when some other hanging body is already swaying — don't pile on kicks. */
function hangingChainAlreadyMoving(selfId: string): boolean {
  const { connections } = useStrawMobileStore.getState()
  for (const id of getHangingShapeIds(connections)) {
    if (id === selfId) continue
    const other = getBodyRef(id).current
    if (other && bodySpeed(other) > ALREADY_MOVING_SPEED) return true
  }
  return false
}

/**
 * Soft settle for a piece that just joined the hanging chain.
 *
 * Clears leftover reel-in velocity, then — only if the body and chain were
 * nearly still and the hanging count is still small — applies one small
 * deterministic horizontal impulse. Random multi-axis kicks used to compound
 * through shared corners when several spokes joined a hub; with 3+ hangers
 * we only zero velocity so the kick itself cannot start a resonance.
 */
function settleHangingBody(
  shapeId: string,
  body: {
    wakeUp: () => void
    mass: () => number
    linvel: () => { x: number; y: number; z: number }
    angvel: () => { x: number; y: number; z: number }
    applyImpulse: (impulse: { x: number; y: number; z: number }, wake: boolean) => void
    setLinvel: (vel: { x: number; y: number; z: number }, wake: boolean) => void
    setAngvel: (vel: { x: number; y: number; z: number }, wake: boolean) => void
  },
) {
  body.wakeUp()

  const { connections } = useStrawMobileStore.getState()
  const hangingCount = getHangingShapeIds(connections).size
  const alreadyMoving =
    bodySpeed(body) > ALREADY_MOVING_SPEED || hangingChainAlreadyMoving(shapeId)

  // Always kill reel-in / kinematic residue before joints take over.
  body.setLinvel(ZERO_VEL, true)
  body.setAngvel(ZERO_VEL, true)
  if (alreadyMoving || hangingCount > SETTLE_IMPULSE_MAX_HANGING) return

  // Deterministic mild +X sway — enough to read as life, not a hub kick.
  const linvel = { x: SETTLE_SPEED, y: 0.01, z: 0 }
  const mass = body.mass()
  if (mass > 1e-4) {
    body.applyImpulse(
      {
        x: linvel.x * mass * 0.45,
        y: linvel.y * mass * 0.45,
        z: linvel.z * mass * 0.45,
      },
      true,
    )
  } else {
    body.setLinvel(linvel, true)
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
  isVertexSuggested: (vertexIndex: number) => boolean
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
  isVertexSuggested,
  isVertexConnected,
}: Omit<PhysicsShapeProps, 'hanging' | 'reeling'>) {
  const groupRef = useRef<Group>(null)
  const removeShape = useStrawMobileStore((s) => s.removeShape)
  const activeTool = useStrawMobileStore((s) => s.activeTool)
  const isScissors = activeTool === 'scissors'

  useLayoutEffect(() => {
    return registerMeshDriver(shape.id, (position, quaternion) => {
      const group = groupRef.current
      if (!group) return
      group.position.set(position[0], position[1], position[2])
      if (quaternion) {
        group.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3])
      }
    })
  }, [shape.id])

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    const state = useStrawMobileStore.getState()
    const reelPosition = state.reelPositions[shape.id]
    const reelQuaternion = state.reelQuaternions[shape.id]
    if (reelPosition) {
      group.position.set(reelPosition[0], reelPosition[1], reelPosition[2])
      const q = reelQuaternion ?? shape.quaternion
      group.quaternion.set(q[0], q[1], q[2], q[3])
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

  const handleBodyClick = isScissors
    ? (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()
        removeShape(shape.id)
      }
    : undefined

  return (
    <group ref={groupRef} position={shape.position} quaternion={shape.quaternion}>
      <ShapeGroup
        shape={shape}
        interactive={!isScissors}
        onVertexClick={onVertexClick}
        isVertexPending={isVertexPending}
        isVertexSuggested={isVertexSuggested}
        isVertexConnected={isVertexConnected}
        scissorsHover={isScissors}
        onBodyClick={handleBodyClick}
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
  isVertexSuggested,
  isVertexConnected,
}: PhysicsShapeProps) {
  const ref = getBodyRef(shape.id)
  const isSelected = useStrawMobileStore((s) => s.selectedShapeIds.includes(shape.id))
  const showGizmo = useStrawMobileStore(
    (s) => s.selectedShapeIds[s.selectedShapeIds.length - 1] === shape.id,
  )
  const reelPosition = useStrawMobileStore((s) => s.reelPositions[shape.id])
  const reelQuaternion = useStrawMobileStore((s) => s.reelQuaternions[shape.id])
  const isDynamic = hanging && !reeling
  const isFree = !hanging && !reeling
  const worldPosition = reelPosition ?? shape.position
  const worldQuaternion = reelQuaternion ?? shape.quaternion
  const wasDynamicRef = useRef(false)

  // When a shape first becomes dynamic (joins the hook chain / finishes reel-in),
  // zero leftover reel velocity and apply a soft settle — not a random kick.
  useEffect(() => {
    if (!isDynamic) {
      wasDynamicRef.current = false
      return
    }
    if (wasDynamicRef.current) return

    let attempts = 0
    let frameId = 0
    let cancelled = false
    const trySettle = () => {
      if (cancelled) return
      const body = ref.current
      if (body) {
        try {
          // Wait until auto-colliders have attached so mass > 0 and impulses work.
          if (body.numColliders() === 0 && attempts < 20) {
            attempts += 1
            frameId = requestAnimationFrame(trySettle)
            return
          }
          settleHangingBody(shape.id, body)
          wasDynamicRef.current = true
          return
        } catch {
          // Body may not be ready for impulses yet.
        }
      }
      attempts += 1
      if (attempts < 24) frameId = requestAnimationFrame(trySettle)
    }
    frameId = requestAnimationFrame(trySettle)
    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [isDynamic, ref, shape.id])

  return (
    <>
      <RigidBody
        ref={ref}
        type={isDynamic ? 'dynamic' : 'kinematicPosition'}
        position={worldPosition}
        quaternion={worldQuaternion}
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
        // Base hanging damping; HangingEnergyLimiter raises it adaptively
        // when many pieces hang or a body approaches the soft speed caps.
        linearDamping={isDynamic ? 0.65 : 0.4}
        angularDamping={isDynamic ? 0.8 : 0.55}
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
          showGizmo={showGizmo}
          onVertexClick={onVertexClick}
          isVertexPending={isVertexPending}
          isVertexSuggested={isVertexSuggested}
          isVertexConnected={isVertexConnected}
        />
      ) : (
        <DrivenShapeVisual
          shape={shape}
          onVertexClick={onVertexClick}
          isVertexPending={isVertexPending}
          isVertexSuggested={isVertexSuggested}
          isVertexConnected={isVertexConnected}
        />
      )}
    </>
  )
}
