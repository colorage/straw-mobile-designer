import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import {
  fetchMyLikes,
  fetchPublicProjectDetail,
  isCommunityEnabled,
  likeProject,
  unlikeProject,
} from '../community/communityApi'
import {
  discardParkedDraft,
  parkDraft,
  restoreParkedDraft,
} from '../community/previewSession'
import { suppressNextGalleryPersist } from '../gallery/autoPersist'
import { useGalleryStore } from '../gallery/galleryStore'
import type { GalleryFileEnvelope } from '../gallery/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { BRAND_NAME } from '../i18n/locales'
import { useT } from '../i18n/t'
import { Experience } from '../scene/Experience'
import { useStrawMobileStore } from '../state/store'
import { PreviewHud } from '../ui/PreviewHud'

/**
 * Read-only 3D preview of a published community mobile.
 * Orbit + physics stay on; edit tools and canvas mutations stay off.
 */
export function PreviewPage() {
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const importEnvelope = useGalleryStore((s) => s.importEnvelope)
  const loadEntry = useGalleryStore((s) => s.loadEntry)
  const userId = useAuthStore((s) => s.user?.id ?? null)

  const [title, setTitle] = useState('')
  const [likesCount, setLikesCount] = useState(0)
  const [liked, setLiked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [duplicatePending, setDuplicatePending] = useState(false)
  const [likePending, setLikePending] = useState(false)
  const envelopeRef = useRef<GalleryFileEnvelope | null>(null)
  /** When true, unmount should not restore the parked draft (Duplicate flow). */
  const skipRestoreRef = useRef(false)

  useDocumentTitle(
    title
      ? `${title} · ${t('community.title')} · ${BRAND_NAME}`
      : `${t('community.title')} · ${BRAND_NAME}`,
  )

  useEffect(() => {
    if (!id || !isCommunityEnabled) {
      setLoading(false)
      setError(
        isCommunityEnabled
          ? 'preview.missingId'
          : 'community.notConfigured',
      )
      return
    }

    let cancelled = false
    skipRestoreRef.current = false
    parkDraft()
    suppressNextGalleryPersist()

    void (async () => {
      try {
        const detail = await fetchPublicProjectDetail(id)
        if (cancelled) return
        envelopeRef.current = detail.envelope
        suppressNextGalleryPersist()
        useStrawMobileStore.getState().loadProject(detail.envelope.project)
        useStrawMobileStore.getState().setProjectName(detail.envelope.name)
        useStrawMobileStore.getState().setPreviewMode(true)
        setTitle(detail.envelope.name)
        setLikesCount(detail.likesCount)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'preview.couldNotLoad')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (skipRestoreRef.current) {
        discardParkedDraft()
        return
      }
      restoreParkedDraft()
    }
  }, [id])

  useEffect(() => {
    if (!id || !userId || !isCommunityEnabled) {
      setLiked(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const likes = await fetchMyLikes(userId)
        if (!cancelled) setLiked(likes.has(id))
      } catch {
        // Non-fatal: heart starts unfilled.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, userId])

  const handleBack = () => {
    navigate('/gallery#community')
  }

  const handleDuplicate = () => {
    const envelope = envelopeRef.current
    if (!envelope || duplicatePending) return
    setError(null)
    setDuplicatePending(true)
    try {
      skipRestoreRef.current = true
      discardParkedDraft()
      suppressNextGalleryPersist()
      const localId = importEnvelope(envelope)
      if (!loadEntry(localId)) {
        setError('preview.savedNotOpen')
        setDuplicatePending(false)
        skipRestoreRef.current = false
        return
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'preview.couldNotDuplicate')
      setDuplicatePending(false)
      skipRestoreRef.current = false
    }
  }

  const handleToggleLike = async () => {
    if (!id || likePending) return
    if (!userId) {
      setError('community.signInToLike')
      return
    }
    setError(null)
    const wasLiked = liked
    setLikePending(true)
    setLiked(!wasLiked)
    setLikesCount((count) => Math.max(0, count + (wasLiked ? -1 : 1)))
    try {
      if (wasLiked) await unlikeProject(id)
      else await likeProject(id)
    } catch (err) {
      setLiked(wasLiked)
      setLikesCount((count) => Math.max(0, count + (wasLiked ? 1 : -1)))
      setError(err instanceof Error ? err.message : 'community.couldNotLike')
    } finally {
      setLikePending(false)
    }
  }

  if (!isCommunityEnabled) {
    return (
      <div className="gallery-page">
        <div className="gallery-page-empty">
          <p className="panel-hint">{t('community.notConfigured')}</p>
          <button type="button" className="primary-button gallery-page-empty-cta" onClick={handleBack}>
            {t('preview.back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <main className="canvas-area">
        <Experience />
        <div className="hud-layer">
          {loading ? (
            <p className="preview-hud-status">{t('preview.loading')}</p>
          ) : (
            <PreviewHud
              title={title}
              likesCount={likesCount}
              liked={liked}
              likeDisabled={likePending || Boolean(error && !title)}
              duplicateDisabled={duplicatePending || !envelopeRef.current}
              onLike={handleToggleLike}
              onDuplicate={handleDuplicate}
              onBack={handleBack}
              error={error}
            />
          )}
        </div>
      </main>
    </div>
  )
}
