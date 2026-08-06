import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  fetchMyLikes,
  fetchPublicProjectDetail,
  likeProject,
  unlikeProject,
} from '../community/communityApi'
import {
  discardParkedDraft,
  parkDraft,
  restoreParkedDraft,
} from '../community/previewSession'
import { getCurrentUserId, isCommunityEnabled } from '../community/supabaseClient'
import { suppressNextGalleryPersist } from '../gallery/autoPersist'
import { useGalleryStore } from '../gallery/galleryStore'
import type { GalleryFileEnvelope } from '../gallery/types'
import { Experience } from '../scene/Experience'
import { useStrawMobileStore } from '../state/store'
import { PreviewHud } from '../ui/PreviewHud'

/**
 * Read-only 3D preview of a published community mobile.
 * Orbit + physics stay on; edit tools and canvas mutations stay off.
 */
export function PreviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const importEnvelope = useGalleryStore((s) => s.importEnvelope)
  const loadEntry = useGalleryStore((s) => s.loadEntry)

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

  useEffect(() => {
    if (!id || !isCommunityEnabled) {
      setLoading(false)
      setError(
        isCommunityEnabled
          ? 'Missing community project id.'
          : 'The community gallery is not configured for this build.',
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
        // Drop undo history that would reach back into the parked draft.
        useStrawMobileStore.setState({ past: [], future: [] })
        useStrawMobileStore.getState().setPreviewMode(true)
        setTitle(detail.envelope.name)
        setLikesCount(detail.likesCount)

        const userId = await getCurrentUserId()
        if (!cancelled && userId) {
          try {
            const likes = await fetchMyLikes(userId)
            if (!cancelled) setLiked(likes.has(id))
          } catch {
            // Non-fatal: heart starts unfilled.
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load this mobile.')
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

  const handleBack = () => {
    navigate('/community')
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
        setError('Saved a copy to your gallery, but could not open it in the designer.')
        setDuplicatePending(false)
        skipRestoreRef.current = false
        return
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate this mobile.')
      setDuplicatePending(false)
      skipRestoreRef.current = false
    }
  }

  const handleToggleLike = async () => {
    if (!id || likePending) return
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
      setError(err instanceof Error ? err.message : 'Could not update the like.')
    } finally {
      setLikePending(false)
    }
  }

  if (!isCommunityEnabled) {
    return (
      <div className="gallery-page">
        <div className="gallery-page-empty">
          <p className="panel-hint">The community gallery is not configured for this build.</p>
          <button type="button" className="primary-button gallery-page-empty-cta" onClick={handleBack}>
            Back to gallery
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
            <p className="preview-hud-status">Loading preview…</p>
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
