import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import {
  createComment,
  deleteComment,
  fetchComments,
  fetchMyLikes,
  fetchPublicProjectDetail,
  isCommunityEnabled,
  likeProject,
  unlikeProject,
  type CommunityComment,
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
import { CommentPanel } from '../ui/CommentPanel'
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
  const [commentsCount, setCommentsCount] = useState(0)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [duplicatePending, setDuplicatePending] = useState(false)
  const [likePending, setLikePending] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<CommunityComment[] | null>(null)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentSubmitting, setCommentSubmitting] = useState(false)
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
    setComments(null)
    setCommentError(null)
    setCommentsOpen(false)
    setCommentsCount(0)
    setOwnerId(null)

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
        setCommentsCount(detail.commentsCount)
        setOwnerId(detail.owner)
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

  useEffect(() => {
    if (!commentsOpen || !id || !isCommunityEnabled) return
    if (comments !== null) return
    let cancelled = false
    setCommentsLoading(true)
    setCommentError(null)
    void (async () => {
      try {
        const items = await fetchComments(id)
        if (!cancelled) setComments(items)
      } catch (err) {
        if (!cancelled) {
          setCommentError(err instanceof Error ? err.message : 'community.couldNotLoadComments')
          setComments([])
        }
      } finally {
        if (!cancelled) setCommentsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [commentsOpen, comments, id])

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

  const handleSubmitComment = async (body: string, files: File[]) => {
    if (!id) return
    if (!userId) {
      setCommentError('community.signInToComment')
      throw new Error('community.signInToComment')
    }
    setCommentError(null)
    setCommentSubmitting(true)
    try {
      const comment = await createComment(id, body, files)
      setComments((prev) => [...(prev ?? []), comment])
      setCommentsCount((count) => count + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'community.couldNotPostComment'
      setCommentError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setCommentSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    setCommentError(null)
    try {
      await deleteComment(commentId)
      setComments((prev) => prev?.filter((comment) => comment.id !== commentId) ?? prev)
      setCommentsCount((count) => Math.max(0, count - 1))
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'community.couldNotDeleteComment')
      throw err
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
            <>
              <PreviewHud
                title={title}
                likesCount={likesCount}
                commentsCount={commentsCount}
                liked={liked}
                commentsOpen={commentsOpen}
                likeDisabled={likePending || Boolean(error && !title)}
                commentsDisabled={Boolean(error && !title)}
                duplicateDisabled={duplicatePending || !envelopeRef.current}
                onLike={handleToggleLike}
                onToggleComments={() => setCommentsOpen((open) => !open)}
                onDuplicate={handleDuplicate}
                onBack={handleBack}
                error={error}
              />
              <CommentPanel
                open={commentsOpen}
                projectTitle={title}
                comments={comments}
                loading={commentsLoading}
                submitting={commentSubmitting}
                error={commentError}
                userId={userId}
                projectOwnerId={ownerId}
                onClose={() => setCommentsOpen(false)}
                onSubmit={handleSubmitComment}
                onDelete={handleDeleteComment}
              />
            </>
          )}
        </div>
      </main>
    </div>
  )
}
