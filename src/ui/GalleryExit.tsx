import { Link } from 'react-router-dom'
import { flushGalleryPersist } from '../gallery/autoPersist'
import { GridIcon } from './icons'

/** Top-right control to leave the designer and open the gallery. */
export function GalleryExit() {
  return (
    <div className="hud-cluster hud-top-right">
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
