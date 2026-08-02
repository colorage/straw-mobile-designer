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
    <mesh
      position={position}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[radius, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={pending ? COLOR_PENDING : '#000000'}
        emissiveIntensity={pending ? 0.5 : 0}
      />
    </mesh>
  )
}
