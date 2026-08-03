/** Decorative ceiling-hook knob marking the fixed anchor point. Purely visual. */
export function AnchorPoint() {
  return (
    <mesh castShadow={false} receiveShadow={false} frustumCulled={false}>
      <octahedronGeometry args={[0.13, 0]} />
      {/* Unlit so the hook stays visible even when PBR/shadows fail (software GL). */}
      <meshBasicMaterial color="#a9afbc" toneMapped={false} />
    </mesh>
  )
}
