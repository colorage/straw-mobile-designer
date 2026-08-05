import type { ReactNode } from 'react'
import { STRAW_SIZES, STRAW_SIZE_LABELS, type StrawSize } from '../state/types'
import { useStrawMobileStore } from '../state/store'
import { SizeHalfIcon, SizeOneIcon, SizeQuarterIcon } from './icons'

const SIZE_ICONS: Record<StrawSize, ReactNode> = {
  1: <SizeOneIcon className="hud-icon" />,
  0.5: <SizeHalfIcon className="hud-icon" />,
  0.25: <SizeQuarterIcon className="hud-icon" />,
}

/** Middle-right icon buttons for the straw-cut length applied to newly added shapes. */
export function SizeSelector() {
  const strawSize = useStrawMobileStore((s) => s.strawSize)
  const setStrawSize = useStrawMobileStore((s) => s.setStrawSize)

  return (
    <div className="hud-cluster hud-middle-right" role="radiogroup" aria-label="Straw size">
      {STRAW_SIZES.map((size) => {
        const selected = strawSize === size
        const label = STRAW_SIZE_LABELS[size]
        return (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            className={`hud-size-button${selected ? ' is-selected' : ''}`}
            onClick={() => setStrawSize(size)}
          >
            {SIZE_ICONS[size]}
          </button>
        )
      })}
    </div>
  )
}
