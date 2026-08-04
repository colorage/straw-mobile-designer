import { useMemo } from 'react'
import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { useShadowsEnabled, useSoftwareGL } from './renderCapability'

interface StrawMeshProps {
  start: Vector3Tuple
  end: Vector3Tuple
  radius?: number
  color?: string
}

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Renders a single straw edge as a thin cylinder tube between two points.
 *
 * Uses lit materials + shadows on real GPUs; falls back to unlit on software
 * WebGL (SwiftShader) where MeshStandardMaterial can shade to near-black.
 */
export function StrawMesh({ start, end, radius = 0.032, color = '#dcc186' }: StrawMeshProps) {
  const softwareGL = useSoftwareGL()
  const shadowsEnabled = useShadowsEnabled()
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...start)
    const b = new THREE.Vector3(...end)
    const midpoint = a.clone().add(b).multiplyScalar(0.5)
    const direction = b.clone().sub(a)
    const len = direction.length() || 0.0001
    const rotation = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize())
    return { position: midpoint, quaternion: rotation, length: len }
  }, [start, end])

  return (
    <mesh
      position={position}
      quaternion={quaternion}
      castShadow={shadowsEnabled}
      receiveShadow={shadowsEnabled}
      frustumCulled={false}
    >
      <cylinderGeometry args={[radius, radius, length, 10]} />
      {softwareGL ? (
        <meshBasicMaterial color={color} toneMapped={false} />
      ) : (
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.05} />
      )}
    </mesh>
  )
}
