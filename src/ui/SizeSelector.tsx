import { STRAW_SIZES, STRAW_SIZE_LABELS } from '../state/types'
import { useStrawMobileStore } from '../state/store'

/** Middle-right radios for the straw-cut length applied to newly added shapes. */
export function SizeSelector() {
  const strawSize = useStrawMobileStore((s) => s.strawSize)
  const setStrawSize = useStrawMobileStore((s) => s.setStrawSize)

  return (
    <div className="hud-cluster hud-middle-right" role="radiogroup" aria-label="Straw size">
      {STRAW_SIZES.map((size) => {
        const selected = strawSize === size
        return (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`hud-radio-option${selected ? ' is-selected' : ''}`}
            onClick={() => setStrawSize(size)}
          >
            <span className="hud-radio-label">{STRAW_SIZE_LABELS[size]}</span>
            <span className="hud-radio-dot" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
