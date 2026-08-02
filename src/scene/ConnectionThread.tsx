import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { Line2 } from 'three-stdlib'
import type { Connection, Shape } from '../state/types'
import { getEndpointWorldPosition } from './endpointPosition'

interface ConnectionThreadProps {
  connection: Connection
  shapesById: Map<string, Shape>
}

/** Thin thread line between two corners; tracks live body poses each frame. */
export function ConnectionThread({ connection, shapesById }: ConnectionThreadProps) {
  const lineRef = useRef<Line2>(null)

  const writePoints = () => {
    const start = getEndpointWorldPosition(connection.a, shapesById)
    const end = getEndpointWorldPosition(connection.b, shapesById)
    const geometry = lineRef.current?.geometry
    if (!start || !end || !geometry?.setPositions) return
    try {
      geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z])
    } catch {
      // Geometry can be briefly unavailable during HMR / unmount.
    }
  }

  useLayoutEffect(() => {
    writePoints()
  })

  useFrame(() => {
    writePoints()
  })

  return (
    <Line
      ref={lineRef}
      points={[
        [0, 0, 0],
        [0, 0, 0],
      ]}
      color="#f2e9d3"
      lineWidth={1.4}
      dashed={false}
    />
  )
}
