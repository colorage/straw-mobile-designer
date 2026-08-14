import { useEffect, useRef, useState, type ChangeEvent } from 'react'
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
import { BRAND_NAME } from '../i18n/locales'
import { t, useT, useTOrRaw } from '../i18n/t'
import { useStrawMobileStore } from '../state/store'
import { AccountControl } from '../ui/AccountControl'
import { AccountNotices } from '../ui/AccountNotices'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import {
  DownloadIcon,
  PublishIcon,
  TrashIcon,
  UnpublishIcon,
} from '../ui/icons'
import { CommunitySection } from './CommunitySection'

function confirmOverwriteDraft(): boolean {
  const { shapes } = useStrawMobileStore.getState()
  if (shapes.length === 0) return true
  return window.confirm(t('gallery.confirmOverwrite'))
}

function confirmStartNew(): boolean {
  const { shapes } = useStrawMobileStore.getState()
  if (shapes.length === 0) return true
  return window.confirm(t('gallery.confirmNew'))
}

/** Full-page gallery: personal projects and community in one scrollable screen. */
export function GalleryPage() {
  const translate = useT()
  const tRaw = useTOrRaw()
  useDocumentTitle(`${translate('gallery.title')} · ${BRAND_NAME}`)
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

  useEffect(() => {
    if (window.location.hash !== '#community') return
    const target = document.getElementById('community')
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

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
      setError('gallery.couldNotLoad')
      return
    }
    goToDesigner()
  }

  const handleDelete = (entry: GalleryEntry) => {
    setError(null)
    if (!window.confirm(t('gallery.confirmDelete', { name: entry.name }))) return
    deleteEntry(entry.id)
  }

  const handlePublish = async (entry: GalleryEntry) => {
    setError(null)
    if (!userId) {
      setError('gallery.signInToPublish')
      return
    }
    setPublishPendingId(entry.id)
    try {
      const publicId = await publishEntry(entry, published[entry.id]?.publicId)
      markPublished(entry.id, publicId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'gallery.couldNotPublish')
    } finally {
      setPublishPendingId(null)
    }
  }

  const handleUnpublish = async (entry: GalleryEntry) => {
    setError(null)
    const record = published[entry.id]
    if (!record) return
    if (!window.confirm(t('gallery.confirmUnpublish', { name: entry.name }))) return
    setPublishPendingId(entry.id)
    try {
      await unpublishProject(record.publicId)
      markUnpublished(entry.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'gallery.couldNotUnpublish')
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
        setError('gallery.importedNotLoad')
        return
      }
      goToDesigner()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'gallery.couldNotImport')
    }
  }

  const cloudSubtitle = nickname
    ? translate('gallery.projectsCloudNamed', { name: nickname })
    : translate('gallery.projectsCloudYou')

  return (
    <div className="gallery-page">
      <header className="gallery-page-header">
        <div className="gallery-page-header-text">
          <p className="gallery-page-eyebrow">{translate('gallery.eyebrow')}</p>
          <h1 className="gallery-page-title">{translate('gallery.title')}</h1>
          <p className="gallery-page-subtitle">{translate('gallery.subtitle')}</p>
        </div>
        <div className="gallery-page-header-tools">
          <div className="gallery-page-project-actions" aria-label={translate('gallery.projectActions')}>
            <button type="button" className="primary-button gallery-page-action" onClick={handleNew}>
              {translate('gallery.new')}
            </button>
            <button
              type="button"
              className="ghost-button gallery-page-action"
              onClick={handleImportClick}
            >
              {translate('gallery.importJson')}
            </button>
            <Link to="/" className="ghost-button gallery-page-action gallery-page-back">
              {translate('gallery.backToDesigner')}
            </Link>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="gallery-file-input"
              onChange={handleImportFile}
            />
          </div>
          <div className="gallery-page-account" aria-label={translate('gallery.account')}>
            <LanguageSwitcher />
            <AccountControl />
          </div>
        </div>
      </header>

      <div className="gallery-page-notices">
        <AccountNotices />
      </div>

      {error && <p className="gallery-error gallery-page-error">{tRaw(error)}</p>}

      <section id="projects" className="gallery-section" aria-labelledby="projects-heading">
        <div className="gallery-section-header">
          <div className="gallery-section-header-text">
            <h2 id="projects-heading" className="gallery-section-title">
              {translate('gallery.projects')}
            </h2>
            <p className="gallery-section-subtitle">
              {mode === 'cloud' ? cloudSubtitle : translate('gallery.projectsLocal')}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="gallery-page-empty gallery-section-empty">
            <p className="panel-hint">{translate('gallery.loading')}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="gallery-page-empty gallery-section-empty">
            <p className="panel-hint">{translate('gallery.empty')}</p>
            <p className="panel-hint">{translate('gallery.emptyHint')}</p>
            <Link to="/" className="primary-button gallery-page-action gallery-page-empty-cta">
              {translate('gallery.openDesigner')}
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
                    aria-label={translate('gallery.load', { name: entry.name })}
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
                        {isPublished && (
                          <span className="gallery-item-badge">{translate('gallery.public')}</span>
                        )}
                      </span>
                      <span className="gallery-item-date">{formatRelativeDate(entry.updatedAt)}</span>
                    </div>
                    <div className="gallery-item-actions">
                      {isCommunityEnabled && !isPublished && (
                        <button
                          type="button"
                          className="gallery-item-icon-button"
                          disabled={isPublishPending}
                          title={
                            isPublishPending
                              ? translate('gallery.publishing')
                              : translate('gallery.publish')
                          }
                          aria-label={
                            isPublishPending
                              ? translate('gallery.publishingName', { name: entry.name })
                              : translate('gallery.publishName', { name: entry.name })
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
                          title={
                            isPublishPending
                              ? translate('gallery.unpublishing')
                              : translate('gallery.unpublish')
                          }
                          aria-label={
                            isPublishPending
                              ? translate('gallery.unpublishingName', { name: entry.name })
                              : translate('gallery.unpublishName', { name: entry.name })
                          }
                          onClick={() => handleUnpublish(entry)}
                        >
                          <UnpublishIcon className="gallery-item-icon" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="gallery-item-icon-button"
                        title={translate('gallery.downloadJson')}
                        aria-label={translate('gallery.downloadName', { name: entry.name })}
                        onClick={() => exportEntry(entry.id)}
                      >
                        <DownloadIcon className="gallery-item-icon" />
                      </button>
                      <button
                        type="button"
                        className="gallery-item-icon-button gallery-item-icon-button-danger"
                        title={translate('gallery.delete')}
                        aria-label={translate('gallery.deleteName', { name: entry.name })}
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
      </section>

      <CommunitySection />
    </div>
  )
}
