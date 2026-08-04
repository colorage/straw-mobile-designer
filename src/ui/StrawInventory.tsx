import { useMemo } from 'react'
import { computeStrawCounts, formatSolidEquivalent } from '../state/store'
import { useStrawMobileStore } from '../state/store'

/** Bottom-right live tally: solid-equivalent total plus per-size counts. */
export function StrawInventory() {
  const shapes = useStrawMobileStore((s) => s.shapes)
  const counts = useMemo(() => computeStrawCounts(shapes), [shapes])

  return (
    <div className="hud-cluster hud-bottom-right" aria-live="polite">
      <p className="hud-stats-line">Straws used: {formatSolidEquivalent(counts.total)}</p>
      <p className="hud-stats-line hud-stats-breakdown">
        Solid: {counts.bySize[1]}
        <span className="hud-stats-gap" />
        1/2: {counts.bySize[0.5]}
        <span className="hud-stats-gap" />
        1/4: {counts.bySize[0.25]}
      </p>
    </div>
  )
}
