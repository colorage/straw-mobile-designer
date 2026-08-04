import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGalleryStore } from '../gallery/galleryStore'
import { useStrawMobileStore } from '../state/store'
import { GridIcon, SaveIcon } from './icons'

type PersistResult = { ok: true; mode: 'saved' | 'updated' } | { ok: false; reason: string }

/** Persist the working draft into the gallery library (save or update). */
function persistDraftToGallery(): PersistResult {
  const { shapes, projectName } = useStrawMobileStore.getState()
  if (shapes.length === 0) {
    return { ok: false, reason: 'Add some shapes before saving to the gallery.' }
  }

  const { activeGalleryId, entries, saveCurrent, updateActive } = useGalleryStore.getState()
  const activeEntry = activeGalleryId
    ? entries.find((entry) => entry.id === activeGalleryId)
    : undefined

  if (activeEntry) {
    updateActive()
    return { ok: true, mode: 'updated' }
  }

  saveCurrent(projectName.trim() || 'Untitled mobile')
  return { ok: true, mode: 'saved' }
}

/** Top-right gallery cluster: save/update the draft and open the gallery. */
export function GalleryExit() {
  const activeGalleryId = useGalleryStore((s) => s.activeGalleryId)
  const entries = useGalleryStore((s) => s.entries)
  const shapeCount = useStrawMobileStore((s) => s.shapes.length)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const activeEntry = activeGalleryId
    ? entries.find((entry) => entry.id === activeGalleryId)
    : undefined

  const handleSave = () => {
    const result = persistDraftToGallery()
    if (!result.ok) {
      setError(result.reason)
      setStatus(null)
      return
    }
    setError(null)
    setStatus(result.mode === 'updated' ? 'Updated in gallery' : 'Saved to gallery')
    window.setTimeout(() => setStatus(null), 1600)
  }

  const handleOpenGallery = () => {
    // Keep the gallery in sync with the current draft when leaving the designer.
    if (shapeCount > 0) {
      persistDraftToGallery()
    }
    setError(null)
    setStatus(null)
  }

  const saveLabel = activeEntry ? `Update “${activeEntry.name}”` : 'Save to gallery'

  return (
    <div className="hud-cluster hud-top-right">
      <div className="hud-gallery-actions">
        <button
          type="button"
          className={`hud-icon-button${status ? ' is-saved' : ''}`}
          title={saveLabel}
          aria-label={saveLabel}
          onClick={handleSave}
        >
          <SaveIcon className="hud-icon" />
        </button>
        <Link
          to="/gallery"
          className="hud-icon-button hud-exit-link"
          title="Open gallery"
          aria-label="Open gallery"
          onClick={handleOpenGallery}
        >
          <GridIcon className="hud-icon" />
        </Link>
      </div>
      {error && <p className="hud-gallery-error">{error}</p>}
      {!error && status && (
        <p className="hud-gallery-status" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  )
}
