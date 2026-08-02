import { Line } from '@react-three/drei'
import type { Connection, Shape } from '../state/types'
import { getEndpointWorldPosition } from './endpointPosition'

interface ConnectionThreadProps {
  connection: Connection
  shapesById: Map<string, Shape>
}

/** Thin thread line drawn between two connected corners while designing. */
export function ConnectionThread({ connection, shapesById }: ConnectionThreadProps) {
  const start = getEndpointWorldPosition(connection.a, shapesById)
  const end = getEndpointWorldPosition(connection.b, shapesById)

  if (!start || !end) return null

  return <Line points={[start, end]} color="#f2e9d3" lineWidth={1.4} dashed={false} />
}
