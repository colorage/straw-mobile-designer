import { useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { isCommunityEnabled, publishEntry, unpublishProject } from '../community/communityApi'
import { usePublishedMapStore } from '../community/publishedMap'
import { suppressNextGalleryPersist } from '../gallery/autoPersist'
import { useGalleryStore } from '../gallery/galleryStore'
import { readGalleryFile } from '../gallery/jsonIo'
import { nextProjectName } from '../gallery/projectName'
import { formatRelativeDate } from '../gallery/relativeDate'
import type { GalleryEntry } from '../gallery/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useStrawMobileStore } from '../state/store'
import { AccountControl } from '../ui/AccountControl'
import { AccountNotices } from '../ui/AccountNotices'
import {
  DownloadIcon,
  PublishIcon,
  TrashIcon,
  UnpublishIcon,
} from '../ui/icons'

function confirmOverwriteDraft(): boolean {
  const { shapes } = useStrawMobileStore.getState()
  if (shapes.length === 0) return true
  return window.confirm(
    'Replace the current draft with this gallery mobile? Unsaved draft changes will be lost (the autosaved draft will update).',
  )
}

function confirmStartNew(): boolean {
  const { shapes } = useStrawMobileStore.getState()
  if (shapes.length === 0) return true
  return window.confirm(
    'Clear the current draft and start a new mobile? Unsaved draft changes will be lost (the autosaved draft will update).',
  )
}

/** Full-page gallery: browse, load, import, export, and delete named saves. */
export function GalleryPage() {
  useDocumentTitle('Gallery · Павучы клуб')
  const navigate = useNavigate()
  const entries = useGalleryStore((s) => s.entries)
  const activeGalleryId = useGalleryStore((s) => s.activeGalleryId)
  const loadEntry = useGalleryStore((s) => s.loadEntry)
  const deleteEntry = useGalleryStore((s) => s.deleteEntry)
  const exportEntry = useGalleryStore((s) => s.exportEntry)
  const importEnvelope = useGalleryStore((s) => s.importEnvelope)
  const clearActive = useGalleryStore((s) => s.clearActive)
  const mode = useGalleryStore((s) => s.mode)
  const loading = useGalleryStore((s) => s.loading)
  const nickname = useAuthStore((s) => s.profile?.nickname)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const reset = useStrawMobileStore((s) => s.reset)
  const setProjectName = useStrawMobileStore((s) => s.setProjectName)
  const published = usePublishedMapStore((s) => s.published)
  const markPublished = usePublishedMapStore((s) => s.markPublished)
  const markUnpublished = usePublishedMapStore((s) => s.markUnpublished)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishPendingId, setPublishPendingId] = useState<string | null>(null)

  const goToDesigner = () => {
    navigate('/')
  }

  const handleNew = () => {
    setError(null)
    if (!confirmStartNew()) return
    suppressNextGalleryPersist()
    reset()
    clearActive()
    setProjectName(nextProjectName(entries.map((entry) => entry.name)))
    goToDesigner()
  }

  const handleLoad = (entry: GalleryEntry) => {
    setError(null)
    if (!confirmOverwriteDraft()) return
    suppressNextGalleryPersist()
    if (!loadEntry(entry.id)) {
      setError('Could not load that mobile.')
      return
    }
    goToDesigner()
  }

  const handleDelete = (entry: GalleryEntry) => {
    setError(null)
    if (!window.confirm(`Delete “${entry.name}” from the gallery?`)) return
    deleteEntry(entry.id)
  }

  const handlePublish = async (entry: GalleryEntry) => {
    setError(null)
    if (!userId) {
      setError('Sign in to publish a mobile to the community gallery.')
      return
    }
    setPublishPendingId(entry.id)
    try {
      const publicId = await publishEntry(entry, published[entry.id]?.publicId)
      markPublished(entry.id, publicId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish this mobile.')
    } finally {
      setPublishPendingId(null)
    }
  }

  const handleUnpublish = async (entry: GalleryEntry) => {
    setError(null)
    const record = published[entry.id]
    if (!record) return
    if (!window.confirm(`Remove “${entry.name}” from the community gallery?`)) return
    setPublishPendingId(entry.id)
    try {
      await unpublishProject(record.publicId)
      markUnpublished(entry.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unpublish this mobile.')
    } finally {
      setPublishPendingId(null)
    }
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
      suppressNextGalleryPersist()
      if (!loadEntry(id)) {
        setError('Imported, but could not load into the designer.')
        return
      }
      goToDesigner()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that file.')
    }
  }

  return (
    <div className="gallery-page">
      <header className="gallery-page-header">
        <div className="gallery-page-header-text">
          <p className="gallery-page-eyebrow">Straw Mobile Designer</p>
          <h1 className="gallery-page-title">Projects</h1>
          <p className="gallery-page-subtitle">
            {mode === 'cloud'
              ? `Named mobiles saved to ${nickname ? `${nickname}’s` : 'your'} account, available from any browser. Export JSON for a personal backup.`
              : 'Named mobiles saved in this browser. Export JSON to back them up or move between devices.'}
          </p>
        </div>
        <div className="gallery-page-header-tools">
          <div className="gallery-page-project-actions" aria-label="Project actions">
            <button type="button" className="primary-button gallery-page-action" onClick={handleNew}>
              New
            </button>
            {isCommunityEnabled && (
              <Link to="/community" className="ghost-button gallery-page-action">
                Community
              </Link>
            )}
            <button
              type="button"
              className="ghost-button gallery-page-action"
              onClick={handleImportClick}
            >
              Import JSON
            </button>
            <Link to="/" className="ghost-button gallery-page-action gallery-page-back">
              Back to designer
            </Link>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="gallery-file-input"
              onChange={handleImportFile}
            />
          </div>
          <div className="gallery-page-account" aria-label="Account">
            <AccountControl />
          </div>
        </div>
      </header>

      <div className="gallery-page-notices">
        <AccountNotices />
      </div>

      {error && <p className="gallery-error gallery-page-error">{error}</p>}

      {loading ? (
        <div className="gallery-page-empty">
          <p className="panel-hint">Loading your mobiles…</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="gallery-page-empty">
          <p className="panel-hint">No saved mobiles yet.</p>
          <p className="panel-hint">
            Build something in the designer — your current project is saved here automatically.
          </p>
          <Link to="/" className="primary-button gallery-page-action gallery-page-empty-cta">
            Open designer
          </Link>
        </div>
      ) : (
        <ul className="gallery-page-grid">
          {entries.map((entry) => {
            const isActive = entry.id === activeGalleryId
            const isPublished = Boolean(published[entry.id])
            const isPublishPending = publishPendingId === entry.id
            return (
              <li key={entry.id} className={`gallery-item${isActive ? ' is-active' : ''}`}>
                <button
                  type="button"
                  className="gallery-thumb-button"
                  onClick={() => handleLoad(entry)}
                  aria-label={`Load ${entry.name}`}
                >
                  <img
                    className="gallery-thumb"
                    src={entry.thumbnailDataUrl}
                    alt=""
                    width={320}
                    height={200}
                  />
                </button>
                <div className="gallery-item-body">
                  <div className="gallery-item-meta">
                    <span className="gallery-item-name">
                      {entry.name}
                      {isPublished && <span className="gallery-item-badge">Public</span>}
                    </span>
                    <span className="gallery-item-date">{formatRelativeDate(entry.updatedAt)}</span>
                  </div>
                  <div className="gallery-item-actions">
                    {isCommunityEnabled && !isPublished && (
                      <button
                        type="button"
                        className="gallery-item-icon-button"
                        disabled={isPublishPending}
                        title={isPublishPending ? 'Publishing…' : 'Publish to community'}
                        aria-label={
                          isPublishPending ? `Publishing ${entry.name}` : `Publish ${entry.name}`
                        }
                        onClick={() => handlePublish(entry)}
                      >
                        <PublishIcon className="gallery-item-icon" />
                      </button>
                    )}
                    {isCommunityEnabled && isPublished && (
                      <button
                        type="button"
                        className="gallery-item-icon-button gallery-item-icon-button-danger"
                        disabled={isPublishPending}
                        title={isPublishPending ? 'Unpublishing…' : 'Unpublish from community'}
                        aria-label={
                          isPublishPending
                            ? `Unpublishing ${entry.name}`
                            : `Unpublish ${entry.name}`
                        }
                        onClick={() => handleUnpublish(entry)}
                      >
                        <UnpublishIcon className="gallery-item-icon" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="gallery-item-icon-button"
                      title="Download JSON"
                      aria-label={`Download ${entry.name}`}
                      onClick={() => exportEntry(entry.id)}
                    >
                      <DownloadIcon className="gallery-item-icon" />
                    </button>
                    <button
                      type="button"
                      className="gallery-item-icon-button gallery-item-icon-button-danger"
                      title="Delete"
                      aria-label={`Delete ${entry.name}`}
                      onClick={() => handleDelete(entry)}
                    >
                      <TrashIcon className="gallery-item-icon" />
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
