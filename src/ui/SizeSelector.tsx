import { STRAW_SIZES, STRAW_SIZE_LABELS } from '../state/types'
import { useStrawMobileStore } from '../state/store'

/** Segmented control choosing the straw-cut length applied to newly added shapes. */
export function SizeSelector() {
  const strawSize = useStrawMobileStore((s) => s.strawSize)
  const setStrawSize = useStrawMobileStore((s) => s.setStrawSize)

  return (
    <div className="panel">
      <h2 className="panel-title">Straw Size</h2>
      <div className="segmented" role="group" aria-label="Straw size">
        {STRAW_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={`segmented-option${strawSize === size ? ' is-active' : ''}`}
            onClick={() => setStrawSize(size)}
          >
            {STRAW_SIZE_LABELS[size]}
          </button>
        ))}
      </div>
      <p className="panel-hint">Applies to the next shape you add.</p>
    </div>
  )
}
