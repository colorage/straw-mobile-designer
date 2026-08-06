import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Vector3Tuple } from '../geometry/primitives'
import { setMoveCursor } from './freeMoveDrag'
import { isGizmoDragging } from './gizmoDrag'
import { useSoftwareGL } from './renderCapability'

interface VertexHandleProps {
  position: Vector3Tuple
  pending?: boolean
  /** Highlighted while overlapping another corner toward auto-connect. */
  suggested?: boolean
  connected?: boolean
  /** Active move/grab subtarget in select mode. */
  moveTarget?: boolean
  onSelect: () => void
  /** Pointer-down when this corner is the move target — starts a drag. */
  onDragStart?: (event: ThreeEvent<PointerEvent>) => void
}

const COLOR_DEFAULT = '#3d4250'
const COLOR_CONNECTED = '#5fd48a'
const COLOR_PENDING = '#ff5a5f'
const COLOR_HOVER = '#ffd166'
const COLOR_SUGGESTED = '#ffd166'
const COLOR_MOVE_TARGET = '#8fb8ff'

// Generous invisible hit-area radius so corners are easy to click without
// making the visible marker distractingly large.
const HIT_AREA_RADIUS = 0.17

/** A small clickable sphere marking a shape's corner, used to build thread connections. */
export function VertexHandle({
  position,
  pending,
  suggested,
  connected,
  moveTarget,
  onSelect,
  onDragStart,
}: VertexHandleProps) {
  const [hovered, setHovered] = useState(false)
  const softwareGL = useSoftwareGL()

  const color = pending
    ? COLOR_PENDING
    : moveTarget
      ? COLOR_MOVE_TARGET
      : hovered || suggested
        ? COLOR_HOVER
        : connected
          ? COLOR_CONNECTED
          : COLOR_DEFAULT
  const radius = pending || hovered || suggested || moveTarget ? 0.085 : 0.06

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    setHovered(true)
    if (moveTarget && !isGizmoDragging()) {
      setMoveCursor(true)
    } else {
      document.body.style.cursor = 'pointer'
    }
  }

  const handlePointerOut = () => {
    setHovered(false)
    if (moveTarget) {
      setMoveCursor(false)
    } else {
      document.body.style.cursor = 'auto'
    }
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
        onPointerDown={
          moveTarget && onDragStart
            ? (event) => {
                onDragStart(event)
              }
            : undefined
        }
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <sphereGeometry args={[HIT_AREA_RADIUS, 12, 12]} />
      </mesh>
      <mesh castShadow={!softwareGL}>
        <sphereGeometry args={[radius, 16, 16]} />
        {softwareGL ? (
          <meshBasicMaterial color={color} toneMapped={false} />
        ) : (
          <meshStandardMaterial
            color={color}
            roughness={0.45}
            metalness={0.1}
            emissive={
              pending
                ? COLOR_PENDING
                : moveTarget
                  ? COLOR_MOVE_TARGET
                  : suggested
                    ? COLOR_SUGGESTED
                    : '#000000'
            }
            emissiveIntensity={pending ? 0.5 : moveTarget ? 0.35 : suggested ? 0.35 : 0}
          />
        )}
      </mesh>
    </group>
  )
}
