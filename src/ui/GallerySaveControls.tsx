import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGalleryStore } from '../gallery/galleryStore'
import { useStrawMobileStore } from '../state/store'

function defaultSaveName(): string {
  const date = new Date()
  const stamp = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `Mobile ${stamp}`
}

/** Compact save/update controls for the designer sidebar; browsing lives on /gallery. */
export function GallerySaveControls() {
  const entries = useGalleryStore((s) => s.entries)
  const activeGalleryId = useGalleryStore((s) => s.activeGalleryId)
  const saveCurrent = useGalleryStore((s) => s.saveCurrent)
  const updateActive = useGalleryStore((s) => s.updateActive)
  const shapeCount = useStrawMobileStore((s) => s.shapes.length)
  const [error, setError] = useState<string | null>(null)

  const activeEntry = activeGalleryId
    ? entries.find((entry) => entry.id === activeGalleryId)
    : undefined

  const handleSave = () => {
    setError(null)
    if (shapeCount === 0) {
      setError('Add some shapes before saving to the gallery.')
      return
    }
    const name = window.prompt('Name this mobile', defaultSaveName())
    if (name === null) return
    saveCurrent(name)
  }

  const handleUpdate = () => {
    setError(null)
    if (!activeGalleryId) return
    if (shapeCount === 0) {
      setError('Nothing to update — the draft is empty.')
      return
    }
    updateActive()
  }

  return (
    <div className="panel gallery-save-panel">
      <h2 className="panel-title">Gallery</h2>
      <p className="panel-hint gallery-hint">
        Save a named copy of this draft, or open the gallery to browse saved mobiles.
      </p>

      <div className="gallery-actions">
        <button type="button" className="primary-button gallery-save-button" onClick={handleSave}>
          Save to gallery
        </button>
        {activeEntry && (
          <button type="button" className="ghost-button" onClick={handleUpdate}>
            Update “{activeEntry.name}”
          </button>
        )}
        <Link to="/gallery" className="ghost-button gallery-nav-link">
          Open gallery
        </Link>
      </div>

      {error && <p className="gallery-error">{error}</p>}
    </div>
  )
}
