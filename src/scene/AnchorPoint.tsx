/** Decorative ceiling-hook knob marking the fixed anchor point. Purely visual. */
export function AnchorPoint() {
  return (
    <mesh castShadow>
      <octahedronGeometry args={[0.13, 0]} />
      <meshStandardMaterial color="#a9afbc" metalness={0.7} roughness={0.3} />
    </mesh>
  )
}
