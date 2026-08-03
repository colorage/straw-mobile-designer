import { useFixedJoint, useSphericalJoint } from '@react-three/rapier'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStrawMobileStore } from '../state/store'
import { getScaledVertex } from '../state/shapeSpace'
import {
  endpointBodyKey,
  type Connection,
  type EndpointRef,
  type QuatTuple,
  type Shape,
} from '../state/types'
import { getBodyRef } from './bodyRefRegistry'
import { connectionInvolvesReelIn, reelInBodyKeys } from './reelIn'
import { getConnectionJointRoles, type JointRole } from './rigidConnections'

const IDENTITY: QuatTuple = [0, 0, 0, 1]

function localAnchorFor(endpoint: EndpointRef, shapesById: Map<string, Shape>): [number, number, number] {
  if (endpoint.kind === 'anchor') return [0, 0, 0]
  const shape = shapesById.get(endpoint.shapeId)
  if (!shape) return [0, 0, 0]
  return getScaledVertex(shape, endpoint.vertexIndex)
}

function readBodyQuat(bodyKey: string, shapesById: Map<string, Shape>): QuatTuple {
  const body = getBodyRef(bodyKey).current
  if (body) {
    try {
      const r = body.rotation()
      if (
        Number.isFinite(r.x) &&
        Number.isFinite(r.y) &&
        Number.isFinite(r.z) &&
        Number.isFinite(r.w)
      ) {
        return [r.x, r.y, r.z, r.w]
      }
    } catch {
      // Body may have been freed between frames.
    }
  }
  if (bodyKey === 'anchor') return IDENTITY
  return shapesById.get(bodyKey)?.quaternion ?? IDENTITY
}

/**
 * Floppy thread: ball-and-socket so pieces can swing relative to each other.
 */
function SphericalBridge({
  connection,
  shapesById,
}: {
  connection: Connection
  shapesById: Map<string, Shape>
}) {
  const refA = getBodyRef(endpointBodyKey(connection.a))
  const refB = getBodyRef(endpointBodyKey(connection.b))
  const anchorA = localAnchorFor(connection.a, shapesById)
  const anchorB = localAnchorFor(connection.b, shapesById)

  useSphericalJoint(refA, refB, [anchorA, anchorB])

  return null
}

/**
 * Strong-rig weld for a spanning-tree edge inside a cyclic cluster.
 * Local frames lock the relative pose present when the joint mounts (after
 * pose-tighten), so the weld doesn't snap bodies into a shared orientation.
 */
function FixedBridge({
  connection,
  shapesById,
}: {
  connection: Connection
  shapesById: Map<string, Shape>
}) {
  const refA = getBodyRef(endpointBodyKey(connection.a))
  const refB = getBodyRef(endpointBodyKey(connection.b))
  const anchorA = localAnchorFor(connection.a, shapesById)
  const anchorB = localAnchorFor(connection.b, shapesById)

  // Capture once on mount — impulse joints are created from these params.
  const framesRef = useRef<{ frameA: QuatTuple; frameB: QuatTuple } | null>(null)
  if (!framesRef.current) {
    const qA = readBodyQuat(endpointBodyKey(connection.a), shapesById)
    const qB = readBodyQuat(endpointBodyKey(connection.b), shapesById)
    const qa = new THREE.Quaternion(qA[0], qA[1], qA[2], qA[3])
    const qb = new THREE.Quaternion(qB[0], qB[1], qB[2], qB[3])
    // frameA = I; frameB = inv(qB) * qA  ⇒  qA * I = qB * frameB
    const frameB = qb.clone().invert().multiply(qa)
    framesRef.current = {
      frameA: IDENTITY,
      frameB: [frameB.x, frameB.y, frameB.z, frameB.w],
    }
  }

  useFixedJoint(refA, refB, [
    anchorA,
    framesRef.current.frameA,
    anchorB,
    framesRef.current.frameB,
  ])

  return null
}

/**
 * Joints for every settled connection:
 * - fixed (weld) on a spanning tree of cyclic clusters (triangles / pyramids)
 * - spherical on bridges / hook links (mobile swing)
 * - none on redundant cycle edges (visual thread only — avoids overconstraint)
 *
 * Joints that touch a shape still reeling in are omitted so a live hanging body
 * isn't yanked across the gap. Rigid clusters keep their relative poses through
 * hang reel-in via resting-layout translation (see computeRestingPoses).
 */
export function JointsLayer({ connections }: { connections: Connection[] }) {
  const shapes = useStrawMobileStore((s) => s.shapes)
  const reelIns = useStrawMobileStore((s) => s.reelIns ?? [])
  const shapesById = useMemo(() => {
    const map = new Map<string, Shape>()
    for (const shape of shapes) map.set(shape.id, shape)
    return map
  }, [shapes])
  const reelingIds = useMemo(() => reelInBodyKeys(reelIns), [reelIns])
  const roles = useMemo(() => getConnectionJointRoles(connections), [connections])

  return (
    <>
      {connections.map((connection) => {
        if (connectionInvolvesReelIn(connection, reelingIds)) return null
        const role: JointRole = roles.get(connection.id) ?? 'spherical'
        if (role === 'visual') return null
        if (role === 'fixed') {
          return (
            <FixedBridge
              key={`${connection.id}:fixed`}
              connection={connection}
              shapesById={shapesById}
            />
          )
        }
        return (
          <SphericalBridge
            key={`${connection.id}:spherical`}
            connection={connection}
            shapesById={shapesById}
          />
        )
      })}
    </>
  )
}
