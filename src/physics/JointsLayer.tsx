import { useSphericalJoint } from '@react-three/rapier'
import { useMemo } from 'react'
import { useStrawMobileStore } from '../state/store'
import { getScaledVertex } from '../state/shapeSpace'
import { endpointBodyKey, type Connection, type EndpointRef, type Shape } from '../state/types'
import { getBodyRef } from './bodyRefRegistry'
import { connectionInvolvesReelIn, reelInBodyKeys } from './reelIn'

function localAnchorFor(endpoint: EndpointRef, shapesById: Map<string, Shape>): [number, number, number] {
  if (endpoint.kind === 'anchor') return [0, 0, 0]
  const shape = shapesById.get(endpoint.shapeId)
  if (!shape) return [0, 0, 0]
  return getScaledVertex(shape, endpoint.vertexIndex)
}

/**
 * A single thread tying two corners together, implemented as a ball-and-socket
 * joint pinning the two exact local anchor points to coincide. Under gravity
 * every connected piece rotates on this joint until its mass settles below it.
 */
function JointBridge({ connection, shapesById }: { connection: Connection; shapesById: Map<string, Shape> }) {
  const refA = getBodyRef(endpointBodyKey(connection.a))
  const refB = getBodyRef(endpointBodyKey(connection.b))
  const anchorA = localAnchorFor(connection.a, shapesById)
  const anchorB = localAnchorFor(connection.b, shapesById)

  useSphericalJoint(refA, refB, [anchorA, anchorB])

  return null
}

/**
 * Spherical joints for every settled connection.
 *
 * - `deferredConnectionIds`: the new hanging tie waiting on reel-in (parent
 *   joints stay mounted so the chain doesn't drift and snap on remount).
 * - Unlocked reels (free / first-hang): omit every joint touching a reeling
 *   body so kinematic shorten isn't fought by physics.
 */
export function JointsLayer({ connections }: { connections: Connection[] }) {
  const shapes = useStrawMobileStore((s) => s.shapes)
  const reelIns = useStrawMobileStore((s) => s.reelIns ?? [])
  const deferredConnectionIds = useStrawMobileStore((s) => s.deferredConnectionIds ?? [])
  const shapesById = useMemo(() => {
    const map = new Map<string, Shape>()
    for (const shape of shapes) map.set(shape.id, shape)
    return map
  }, [shapes])
  const deferredIds = useMemo(() => new Set(deferredConnectionIds), [deferredConnectionIds])
  const unlockedReelingIds = useMemo(
    () => reelInBodyKeys(reelIns.filter((reel) => !reel.lockTarget)),
    [reelIns],
  )

  return (
    <>
      {connections.map((connection) =>
        deferredIds.has(connection.id) ||
        connectionInvolvesReelIn(connection, unlockedReelingIds) ? null : (
          <JointBridge key={connection.id} connection={connection} shapesById={shapesById} />
        ),
      )}
    </>
  )
}
