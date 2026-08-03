import { useGalleryStore } from '../gallery/galleryStore'
import { useStrawMobileStore } from '../state/store'

/** Project-level actions (reset). */
export function ModeBar() {
  const reset = useStrawMobileStore((s) => s.reset)
  const clearActive = useGalleryStore((s) => s.clearActive)

  return (
    <div className="panel">
      <h2 className="panel-title">Project</h2>
      <button
        type="button"
        className="ghost-button"
        onClick={() => {
          if (window.confirm('Clear the whole mobile (including the autosaved copy) and start over?')) {
            reset()
            clearActive()
          }
        }}
      >
        Reset
      </button>
    </div>
  )
}
