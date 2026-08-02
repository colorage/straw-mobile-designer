import { PivotControls } from '@react-three/drei'
import { RigidBody } from '@react-three/rapier'
import { useEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Object3D } from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
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
 * Every shape is a rigid body. Free shapes stay kinematic so they can be
 * dragged on the workbench; once they join the hanging chain they become
 * dynamic and gravity takes over.
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
  const selectShape = useStrawMobileStore((s) => s.selectShape)
  const moveShape = useStrawMobileStore((s) => s.moveShape)
  const reelPosition = useStrawMobileStore((s) => s.reelPositions[shape.id])
  const isDynamic = hanging && !reeling
  const canDrag = !hanging && !reeling
  const showGizmo = isSelected && canDrag
  const worldPosition = reelPosition ?? shape.position
  const dragBaseRef = useRef<Vector3Tuple>(worldPosition)
  const wasShowingGizmo = useRef(false)
  const rigidObjectRef = useRef<Object3D | null>(null)

  useEffect(() => {
    return registerMeshDriver(shape.id, (position) => {
      rigidObjectRef.current?.position.set(position[0], position[1], position[2])
    })
  }, [shape.id])

  useEffect(() => {
    if (showGizmo && !wasShowingGizmo.current) {
      dragBaseRef.current = worldPosition
    }
    wasShowingGizmo.current = showGizmo
  }, [showGizmo, worldPosition])

  const handleBodyClick = (event: ThreeEvent<MouseEvent>) => {
    if (!canDrag) return
    event.stopPropagation()
    dragBaseRef.current = worldPosition
    selectShape(shape.id)
  }

  const shapeGroup = (
    <ShapeGroup
      shape={shape}
      interactive
      onVertexClick={onVertexClick}
      isVertexPending={isVertexPending}
      isVertexConnected={isVertexConnected}
      selected={showGizmo}
      onBodyClick={canDrag ? handleBodyClick : undefined}
    />
  )

  return (
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
      {/* Child parent is RigidBody's object3D — used to drive the mesh during reel-ins. */}
      <group
        ref={(node) => {
          rigidObjectRef.current = node?.parent ?? null
        }}
      />
      {showGizmo ? (
        <PivotControls
          autoTransform={false}
          disableRotations
          disableScaling
          scale={0.9}
          lineWidth={2.5}
          fixed
          depthTest={false}
          onDrag={(l) => {
            const base = dragBaseRef.current
            const next: Vector3Tuple = [
              base[0] + l.elements[12],
              base[1] + l.elements[13],
              base[2] + l.elements[14],
            ]
            moveShape(shape.id, next)
            rigidObjectRef.current?.position.set(next[0], next[1], next[2])
            const body = ref.current
            if (body) {
              body.setNextKinematicTranslation({ x: next[0], y: next[1], z: next[2] })
              body.setTranslation({ x: next[0], y: next[1], z: next[2] }, true)
            }
          }}
        >
          {shapeGroup}
        </PivotControls>
      ) : (
        shapeGroup
      )}
    </RigidBody>
  )
}
