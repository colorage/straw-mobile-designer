import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import {
  fetchCommunityProjects,
  fetchMyLikes,
  isCommunityEnabled,
  likeProject,
  unlikeProject,
  type CommunityProject,
  type CommunitySort,
} from '../community/communityApi'
import { formatRelativeDate } from '../gallery/relativeDate'
import { useT, useTOrRaw } from '../i18n/t'
import { CommentIcon } from '../ui/icons'

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="community-like-icon"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

/** Community gallery section: browse public mobiles, like them, open a preview. */
export function CommunitySection() {
  const t = useT()
  const tRaw = useTOrRaw()
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? null)

  const [sort, setSort] = useState<CommunitySort>('recent')
  const [projects, setProjects] = useState<CommunityProject[] | null>(null)
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [likePendingIds, setLikePendingIds] = useState<Set<string>>(new Set())

  const refresh = useCallback(async (nextSort: CommunitySort) => {
    setError(null)
    try {
      const items = await fetchCommunityProjects(nextSort)
      setProjects(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'community.couldNotLoad')
      setProjects((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    if (!isCommunityEnabled) return
    void refresh(sort)
  }, [refresh, sort])

  useEffect(() => {
    if (!isCommunityEnabled || !userId) {
      setMyLikes(new Set())
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const likes = await fetchMyLikes(userId)
        if (!cancelled) setMyLikes(likes)
      } catch {
        // Non-fatal: like buttons just start unfilled.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const handleOpen = (item: CommunityProject) => {
    navigate(`/community/${item.id}`)
  }

  const handleToggleLike = async (item: CommunityProject) => {
    if (likePendingIds.has(item.id)) return
    if (!userId) {
      setError('community.signInToLike')
      return
    }
    setError(null)
    const wasLiked = myLikes.has(item.id)

    const applyLike = (liked: boolean) => {
      setMyLikes((prev) => {
        const next = new Set(prev)
        if (liked) next.add(item.id)
        else next.delete(item.id)
        return next
      })
      setProjects(
        (prev) =>
          prev?.map((project) =>
            project.id === item.id
              ? {
                  ...project,
                  likesCount: Math.max(0, project.likesCount + (liked ? 1 : -1)),
                }
              : project,
          ) ?? prev,
      )
    }

    setLikePendingIds((prev) => new Set(prev).add(item.id))
    applyLike(!wasLiked)
    try {
      if (wasLiked) await unlikeProject(item.id)
      else await likeProject(item.id)
    } catch (err) {
      applyLike(wasLiked)
      setError(err instanceof Error ? err.message : 'community.couldNotLike')
    } finally {
      setLikePendingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  return (
    <section id="community" className="gallery-section" aria-labelledby="community-heading">
      <div className="gallery-section-header">
        <div className="gallery-section-header-text">
          <h2 id="community-heading" className="gallery-section-title">
            {t('community.title')}
          </h2>
          <p className="gallery-section-subtitle">{t('community.subtitle')}</p>
        </div>
        {isCommunityEnabled && (
          <div className="community-toolbar">
            <div className="community-sort" role="group" aria-label={t('community.sort')}>
              <button
                type="button"
                className={`community-sort-button${sort === 'recent' ? ' is-active' : ''}`}
                aria-pressed={sort === 'recent'}
                onClick={() => setSort('recent')}
              >
                {t('community.recent')}
              </button>
              <button
                type="button"
                className={`community-sort-button${sort === 'liked' ? ' is-active' : ''}`}
                aria-pressed={sort === 'liked'}
                onClick={() => setSort('liked')}
              >
                {t('community.mostLiked')}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="gallery-error gallery-page-error">{tRaw(error)}</p>}

      {!isCommunityEnabled ? (
        <div className="gallery-page-empty gallery-section-empty">
          <p className="panel-hint">{t('community.notConfigured')}</p>
        </div>
      ) : projects === null ? (
        <p className="community-status">{t('community.loading')}</p>
      ) : projects.length === 0 ? (
        <div className="gallery-page-empty gallery-section-empty">
          <p className="panel-hint">{t('community.empty')}</p>
          <p className="panel-hint">
            {userId ? t('community.emptyHint') : t('community.emptyHintSignIn')}
          </p>
        </div>
      ) : (
        <ul className="gallery-page-grid">
          {projects.map((item) => {
            const liked = myLikes.has(item.id)
            return (
              <li key={item.id} className="gallery-item">
                <button
                  type="button"
                  className="gallery-thumb-button"
                  onClick={() => handleOpen(item)}
                  aria-label={t('community.previewName', { name: item.name })}
                >
                  <img
                    className="gallery-thumb"
                    src={item.thumbnailDataUrl}
                    alt=""
                    width={320}
                    height={200}
                    loading="lazy"
                  />
                </button>
                <div className="gallery-item-body">
                  <div className="gallery-item-meta">
                    <span className="gallery-item-name">{item.name}</span>
                    <span className="gallery-item-date">
                      {item.ownerNickname ? `${item.ownerNickname} · ` : ''}
                      {formatRelativeDate(item.publishedAt)}
                    </span>
                  </div>
                  <div className="gallery-item-actions">
                    <button
                      type="button"
                      className="gallery-item-button"
                      onClick={() => handleOpen(item)}
                    >
                      {t('community.open')}
                    </button>
                    <span
                      className="community-comment-count"
                      aria-label={t('community.commentsCount', { count: item.commentsCount })}
                    >
                      <CommentIcon className="community-comment-icon" />
                      <span>{item.commentsCount}</span>
                    </span>
                    <button
                      type="button"
                      className={`gallery-item-button community-like-button${liked ? ' is-liked' : ''}`}
                      aria-pressed={liked}
                      aria-label={liked ? t('community.unlike', { name: item.name }) : t('community.like', { name: item.name })}
                      onClick={() => handleToggleLike(item)}
                    >
                      <HeartIcon filled={liked} />
                      <span>{item.likesCount}</span>
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
