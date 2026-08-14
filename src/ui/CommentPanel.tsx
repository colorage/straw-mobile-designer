import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CommunityComment } from '../community/communityApi'
import {
  COMMENT_BODY_MAX,
  COMMENT_PHOTO_MAX_COUNT,
  validateCommentPhotoFile,
} from '../community/commentPhotos'
import { formatRelativeDate } from '../gallery/relativeDate'
import { useT, useTOrRaw } from '../i18n/t'
import { CommentIcon } from './icons'

type CommentPanelProps = {
  open: boolean
  projectTitle: string
  comments: CommunityComment[] | null
  loading: boolean
  submitting: boolean
  error: string | null
  userId: string | null
  projectOwnerId: string | null
  onClose: () => void
  onSubmit: (body: string, files: File[]) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
}

type DraftPhoto = {
  id: string
  file: File
  url: string
}

function canDeleteComment(
  comment: CommunityComment,
  userId: string | null,
  projectOwnerId: string | null,
): boolean {
  if (!userId) return false
  return comment.author === userId || projectOwnerId === userId
}

/** Slide-over thread on the community preview: read, post, attach photos. */
export function CommentPanel({
  open,
  projectTitle,
  comments,
  loading,
  submitting,
  error,
  userId,
  projectOwnerId,
  onClose,
  onSubmit,
  onDelete,
}: CommentPanelProps) {
  const t = useT()
  const tRaw = useTOrRaw()
  const [body, setBody] = useState('')
  const [draftPhotos, setDraftPhotos] = useState<DraftPhoto[]>([])
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftPhotosRef = useRef(draftPhotos)
  draftPhotosRef.current = draftPhotos

  useEffect(() => {
    return () => {
      for (const photo of draftPhotosRef.current) URL.revokeObjectURL(photo.url)
    }
  }, [])

  useEffect(() => {
    if (!open) setLightboxUrl(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const node = listRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [open, comments])

  const clearDraftPhotos = () => {
    setDraftPhotos((prev) => {
      for (const photo of prev) URL.revokeObjectURL(photo.url)
      return []
    })
  }

  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList) return
    const incoming = Array.from(fileList)
    setDraftPhotos((prev) => {
      const remaining = COMMENT_PHOTO_MAX_COUNT - prev.length
      const next = [...prev]
      for (const file of incoming.slice(0, remaining)) {
        try {
          validateCommentPhotoFile(file)
        } catch {
          continue
        }
        next.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) })
      }
      return next
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveDraft = (id: string) => {
    setDraftPhotos((prev) => {
      const photo = prev.find((item) => item.id === id)
      if (photo) URL.revokeObjectURL(photo.url)
      return prev.filter((item) => item.id !== id)
    })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    try {
      await onSubmit(
        body,
        draftPhotos.map((photo) => photo.file),
      )
      setBody('')
      clearDraftPhotos()
    } catch {
      // Parent surfaces the error; keep the draft so the user can retry.
    }
  }

  const handleDelete = async (commentId: string) => {
    if (deletingId) return
    setDeletingId(commentId)
    try {
      await onDelete(commentId)
    } finally {
      setDeletingId(null)
    }
  }

  const signedIn = Boolean(userId)
  const canPost = signedIn && (body.trim().length > 0 || draftPhotos.length > 0) && !submitting
  const photoSlotsLeft = COMMENT_PHOTO_MAX_COUNT - draftPhotos.length

  return (
    <>
      <aside
        className={`comment-panel${open ? ' is-open' : ''}`}
        aria-hidden={!open}
        inert={!open}
        aria-label={t('comments.onMobile', { name: projectTitle || t('comments.thisMobile') })}
      >
        <header className="comment-panel-header">
          <div className="comment-panel-heading">
            <CommentIcon className="comment-panel-heading-icon" />
            <h2 className="comment-panel-title">{t('comments.title')}</h2>
            {comments ? (
              <span className="comment-panel-count">{comments.length}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="account-close"
            aria-label={t('comments.close')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div ref={listRef} className="comment-panel-list">
          {loading && comments === null ? (
            <p className="comment-panel-status">{t('comments.loading')}</p>
          ) : comments && comments.length === 0 ? (
            <p className="comment-panel-status">{t('comments.empty')}</p>
          ) : (
            comments?.map((comment) => (
              <article key={comment.id} className="comment-item">
                <div className="comment-item-meta">
                  <span className="comment-item-author">
                    {comment.authorNickname || t('comments.builder')}
                  </span>
                  <span className="comment-item-date">{formatRelativeDate(comment.createdAt)}</span>
                  {canDeleteComment(comment, userId, projectOwnerId) ? (
                    <button
                      type="button"
                      className="comment-item-delete"
                      disabled={deletingId === comment.id}
                      onClick={() => void handleDelete(comment.id)}
                    >
                      {deletingId === comment.id ? t('comments.deleting') : t('comments.delete')}
                    </button>
                  ) : null}
                </div>
                {comment.body ? <p className="comment-item-body">{comment.body}</p> : null}
                {comment.photos.length > 0 ? (
                  <div className="comment-item-photos">
                    {comment.photos.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        className="comment-item-photo-button"
                        onClick={() => setLightboxUrl(photo.publicUrl)}
                      >
                        <img
                          className="comment-item-photo"
                          src={photo.publicUrl}
                          alt=""
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>

        {error ? <p className="comment-panel-error">{tRaw(error)}</p> : null}

        {signedIn ? (
          <form className="comment-compose" onSubmit={(event) => void handleSubmit(event)}>
            <label className="comment-compose-label" htmlFor="comment-body">
              {t('comments.add')}
            </label>
            <textarea
              id="comment-body"
              className="comment-compose-input"
              rows={3}
              maxLength={COMMENT_BODY_MAX}
              placeholder={t('comments.placeholder')}
              value={body}
              disabled={submitting}
              onChange={(event) => setBody(event.target.value)}
            />
            {draftPhotos.length > 0 ? (
              <div className="comment-compose-previews">
                {draftPhotos.map((photo) => (
                  <span key={photo.id} className="comment-compose-preview">
                    <img src={photo.url} alt="" />
                    <button
                      type="button"
                      className="comment-compose-preview-remove"
                      aria-label={t('comments.removePhoto')}
                      onClick={() => handleRemoveDraft(photo.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="comment-compose-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(event) => handleAddFiles(event.target.files)}
              />
              <button
                type="button"
                className="ghost-button comment-compose-photo"
                disabled={submitting || photoSlotsLeft <= 0}
                onClick={() => fileInputRef.current?.click()}
              >
                {photoSlotsLeft <= 0 ? t('comments.photoLimit') : t('comments.addPhotos')}
              </button>
              <button type="submit" className="primary-button comment-compose-submit" disabled={!canPost}>
                {submitting ? t('comments.posting') : t('comments.post')}
              </button>
            </div>
          </form>
        ) : (
          <p className="comment-panel-signin">{t('comments.signIn')}</p>
        )}
      </aside>

      {lightboxUrl ? (
        <button
          type="button"
          className="comment-lightbox"
          aria-label={t('comments.closePhoto')}
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="" />
        </button>
      ) : null}
    </>
  )
}
