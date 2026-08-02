import { useMemo } from 'react'
import { computeStrawCounts } from '../state/store'
import { useStrawMobileStore } from '../state/store'
import { STRAW_SIZES, STRAW_SIZE_LABELS } from '../state/types'

/** Live tally of straws used in the current design, broken down by size. */
export function StrawInventory() {
  const shapes = useStrawMobileStore((s) => s.shapes)
  const counts = useMemo(() => computeStrawCounts(shapes), [shapes])

  return (
    <div className="panel">
      <h2 className="panel-title">Straws Used</h2>
      <ul className="inventory-list">
        {STRAW_SIZES.map((size) => (
          <li key={size} className="inventory-row">
            <span className="inventory-size">{STRAW_SIZE_LABELS[size]}</span>
            <span className="inventory-count">{counts.bySize[size]}</span>
          </li>
        ))}
      </ul>
      <div className="inventory-total">
        <span>Total</span>
        <span>{counts.total}</span>
      </div>
    </div>
  )
}
