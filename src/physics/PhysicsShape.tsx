import { RigidBody } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { Group } from 'three'
import { SelectableShape } from '../scene/SelectableShape'
import { ShapeGroup } from '../scene/ShapeGroup'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { getBodyRef } from './bodyRefRegistry'
import { SHAPE_COLLISION_GROUPS } from './collisionGroups'
import { registerMeshDriver } from './meshDriveRegistry'

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

  return (
    <>
      <RigidBody
        ref={ref}
        type={isDynamic ? 'dynamic' : 'kinematicPosition'}
        position={worldPosition}
        quaternion={shape.quaternion}
        colliders="hull"
        collisionGroups={SHAPE_COLLISION_GROUPS}
        canSleep={false}
        restitution={0.1}
        linearDamping={0.5}
        angularDamping={0.7}
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
