import { useRef, useState, type ChangeEvent } from 'react'
import { useGalleryStore } from '../gallery/galleryStore'
import { readGalleryFile } from '../gallery/jsonIo'
import type { GalleryEntry } from '../gallery/types'
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

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const deltaMs = Date.now() - then
  const minutes = Math.round(deltaMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function confirmOverwriteDraft(): boolean {
  const { shapes } = useStrawMobileStore.getState()
  if (shapes.length === 0) return true
  return window.confirm(
    'Replace the current draft with this gallery mobile? Unsaved draft changes will be lost (the autosaved draft will update).',
  )
}

/** Named local saves with thumbnails, plus JSON import/export. */
export function GalleryPanel() {
  const entries = useGalleryStore((s) => s.entries)
  const activeGalleryId = useGalleryStore((s) => s.activeGalleryId)
  const saveCurrent = useGalleryStore((s) => s.saveCurrent)
  const updateActive = useGalleryStore((s) => s.updateActive)
  const loadEntry = useGalleryStore((s) => s.loadEntry)
  const deleteEntry = useGalleryStore((s) => s.deleteEntry)
  const exportEntry = useGalleryStore((s) => s.exportEntry)
  const importEnvelope = useGalleryStore((s) => s.importEnvelope)
  const shapeCount = useStrawMobileStore((s) => s.shapes.length)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

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

  const handleLoad = (entry: GalleryEntry) => {
    setError(null)
    if (!confirmOverwriteDraft()) return
    loadEntry(entry.id)
  }

  const handleDelete = (entry: GalleryEntry) => {
    setError(null)
    if (!window.confirm(`Delete “${entry.name}” from the gallery?`)) return
    deleteEntry(entry.id)
  }

  const handleImportClick = () => {
    setError(null)
    fileInputRef.current?.click()
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const envelope = await readGalleryFile(file)
      const id = importEnvelope(envelope)
      if (!confirmOverwriteDraft()) return
      loadEntry(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that file.')
    }
  }

  const activeEntry = activeGalleryId
    ? entries.find((entry) => entry.id === activeGalleryId)
    : undefined

  return (
    <div className="panel gallery-panel">
      <h2 className="panel-title">Gallery</h2>
      <p className="panel-hint gallery-hint">
        Save named mobiles in this browser. Export JSON to back them up or move between devices.
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
        <button type="button" className="ghost-button" onClick={handleImportClick}>
          Import JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="gallery-file-input"
          onChange={handleImportFile}
        />
      </div>

      {error && <p className="gallery-error">{error}</p>}

      {entries.length === 0 ? (
        <p className="panel-hint">No saved mobiles yet.</p>
      ) : (
        <ul className="gallery-list">
          {entries.map((entry) => {
            const isActive = entry.id === activeGalleryId
            return (
              <li key={entry.id} className={`gallery-item${isActive ? ' is-active' : ''}`}>
                <img
                  className="gallery-thumb"
                  src={entry.thumbnailDataUrl}
                  alt=""
                  width={320}
                  height={200}
                />
                <div className="gallery-item-body">
                  <div className="gallery-item-meta">
                    <span className="gallery-item-name">{entry.name}</span>
                    <span className="gallery-item-date">{formatRelativeDate(entry.updatedAt)}</span>
                  </div>
                  <div className="gallery-item-actions">
                    <button type="button" className="gallery-item-button" onClick={() => handleLoad(entry)}>
                      Load
                    </button>
                    <button
                      type="button"
                      className="gallery-item-button"
                      onClick={() => exportEntry(entry.id)}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="gallery-item-button gallery-item-button-danger"
                      onClick={() => handleDelete(entry)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
