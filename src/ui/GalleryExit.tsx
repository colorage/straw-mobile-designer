import { Link } from 'react-router-dom'
import { flushGalleryPersist } from '../gallery/autoPersist'
import { useStrawMobileStore } from '../state/store'
import { GridIcon, ThunderIcon } from './icons'

/** Top-right controls: turbo mode + leave designer for the gallery. */
export function GalleryExit() {
  const turboMode = useStrawMobileStore((s) => s.turboMode)
  const setTurboMode = useStrawMobileStore((s) => s.setTurboMode)

  return (
    <div className="hud-cluster hud-top-right">
      <button
        type="button"
        className={`hud-icon-button hud-turbo${turboMode ? ' is-active' : ''}`}
        title={
          turboMode
            ? 'Disable turbo mode'
            : 'Enable turbo mode — disable shadows for better performance'
        }
        aria-label={turboMode ? 'Disable turbo mode' : 'Enable turbo mode'}
        aria-pressed={turboMode}
        onClick={() => setTurboMode(!turboMode)}
      >
        <ThunderIcon className="hud-icon" />
      </button>
      <Link
        to="/gallery"
        className="hud-icon-button hud-exit-link"
        title="Open gallery"
        aria-label="Open gallery"
        onClick={() => {
          flushGalleryPersist()
        }}
      >
        <GridIcon className="hud-icon" />
      </Link>
    </div>
  )
}
