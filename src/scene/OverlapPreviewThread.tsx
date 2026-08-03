import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { Line2 } from 'three-stdlib'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { getEndpointWorldPosition } from './endpointPosition'

/** Dashed preview thread shown while two corners are dwelling toward auto-connect. */
export function OverlapPreviewThread() {
  const overlapSuggest = useStrawMobileStore((s) => s.overlapSuggest)
  const shapes = useStrawMobileStore((s) => s.shapes)
  const lineRef = useRef<Line2>(null)

  const shapesById = useMemo(() => {
    const map = new Map<string, Shape>()
    for (const shape of shapes) map.set(shape.id, shape)
    return map
  }, [shapes])

  const writePoints = () => {
    if (!overlapSuggest) return
    const start = getEndpointWorldPosition(overlapSuggest.a, shapesById)
    const end = getEndpointWorldPosition(overlapSuggest.b, shapesById)
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

  if (!overlapSuggest) return null

  return (
    <Line
      ref={lineRef}
      points={[
        [0, 0, 0],
        [0, 0, 0],
      ]}
      color="#ffd166"
      lineWidth={1.2}
      dashed
      dashSize={0.08}
      gapSize={0.05}
      opacity={0.85}
      transparent
    />
  )
}
