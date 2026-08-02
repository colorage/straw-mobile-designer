import { useSphericalJoint } from '@react-three/rapier'
import { useMemo } from 'react'
import { useStrawMobileStore } from '../state/store'
import { getScaledVertex } from '../state/shapeSpace'
import { endpointBodyKey, type Connection, type EndpointRef, type Shape } from '../state/types'
import { getBodyRef } from './bodyRefRegistry'

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

export function JointsLayer({ connections }: { connections: Connection[] }) {
  const shapes = useStrawMobileStore((s) => s.shapes)
  const shapesById = useMemo(() => {
    const map = new Map<string, Shape>()
    for (const shape of shapes) map.set(shape.id, shape)
    return map
  }, [shapes])

  return (
    <>
      {connections.map((connection) => (
        <JointBridge key={connection.id} connection={connection} shapesById={shapesById} />
      ))}
    </>
  )
}
