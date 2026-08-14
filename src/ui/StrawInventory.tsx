import { useEffect, useMemo, useState } from 'react'
import {
  computeConstructionSizeCm,
  formatCm,
  type ConstructionSizeCm,
} from '../geometry/constructionSize'
import { useT } from '../i18n/t'
import { computeStrawCounts, formatSolidEquivalent } from '../state/store'
import { useStrawMobileStore } from '../state/store'

/** How often to re-measure while pieces may be hanging / settling. */
const SIZE_REFRESH_MS = 250

/** Bottom-right live tally (left of Buy Me a Coffee): solid-equivalent total, per-size counts, and size in cm. */
export function StrawInventory() {
  const t = useT()
  const shapes = useStrawMobileStore((s) => s.shapes)
  const counts = useMemo(() => computeStrawCounts(shapes), [shapes])
  const [size, setSize] = useState<ConstructionSizeCm | null>(null)

  useEffect(() => {
    const measure = () => setSize(computeConstructionSizeCm(shapes))
    measure()
    if (shapes.length === 0) return
    const id = window.setInterval(measure, SIZE_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [shapes])

  return (
    <div className="hud-cluster hud-bottom-right" aria-live="polite">
      <p className="hud-stats-line">{t('inventory.strawsUsed', { count: formatSolidEquivalent(counts.total) })}</p>
      <p className="hud-stats-line hud-stats-breakdown">
        {t('inventory.solid', { count: counts.bySize[1] })}
        <span className="hud-stats-gap" />
        1/2: {counts.bySize[0.5]}
        <span className="hud-stats-gap" />
        1/4: {counts.bySize[0.25]}
      </p>
      {size ? (
        <p className="hud-stats-line hud-stats-breakdown">
          {t('inventory.size', { width: formatCm(size.widthCm), height: formatCm(size.heightCm) })}
        </p>
      ) : null}
    </div>
  )
}
