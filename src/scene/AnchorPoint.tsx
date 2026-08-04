import { useSoftwareGL } from './renderCapability'

/** Decorative ceiling-hook knob marking the fixed anchor point. Purely visual. */
export function AnchorPoint() {
  const softwareGL = useSoftwareGL()

  return (
    <mesh castShadow={!softwareGL} receiveShadow={false} frustumCulled={false}>
      <octahedronGeometry args={[0.13, 0]} />
      {softwareGL ? (
        <meshBasicMaterial color="#a9afbc" toneMapped={false} />
      ) : (
        <meshStandardMaterial color="#a9afbc" metalness={0.7} roughness={0.3} />
      )}
    </mesh>
  )
}
