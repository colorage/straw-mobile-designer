import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Vector3Tuple } from '../geometry/primitives'

interface VertexHandleProps {
  position: Vector3Tuple
  pending?: boolean
  connected?: boolean
  onSelect: () => void
}

const COLOR_DEFAULT = '#3d4250'
const COLOR_CONNECTED = '#5fd48a'
const COLOR_PENDING = '#ff5a5f'
const COLOR_HOVER = '#ffd166'

// Generous invisible hit-area radius so corners are easy to click without
// making the visible marker distractingly large.
const HIT_AREA_RADIUS = 0.17

/** A small clickable sphere marking a shape's corner, used to build thread connections. */
export function VertexHandle({ position, pending, connected, onSelect }: VertexHandleProps) {
  const [hovered, setHovered] = useState(false)

  const color = pending ? COLOR_PENDING : hovered ? COLOR_HOVER : connected ? COLOR_CONNECTED : COLOR_DEFAULT
  const radius = pending || hovered ? 0.085 : 0.06

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }

  const handlePointerOut = () => {
    setHovered(false)
    document.body.style.cursor = 'auto'
  }

  return (
    <group position={position}>
      {/* Invisible mesh with a bigger radius makes the corner much easier to hit
          than the small marker alone; invisible objects are still raycast-testable. */}
      <mesh
        visible={false}
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
        }}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <sphereGeometry args={[HIT_AREA_RADIUS, 12, 12]} />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius, 16, 16]} />
        {/* Unlit marker — stays visible on software WebGL where PBR shades to black. */}
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}
