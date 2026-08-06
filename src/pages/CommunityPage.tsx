import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  fetchCommunityProjects,
  fetchMyLikes,
  likeProject,
  unlikeProject,
  type CommunityProject,
  type CommunitySort,
} from '../community/communityApi'
import { getCurrentUserId, isCommunityEnabled } from '../community/supabaseClient'
import { formatRelativeDate } from '../gallery/relativeDate'

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

/** Full-page community gallery: browse public mobiles, like them, open a preview. */
export function CommunityPage() {
  const navigate = useNavigate()

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
      setError(err instanceof Error ? err.message : 'Could not load the community gallery.')
      setProjects((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    if (!isCommunityEnabled) return
    void refresh(sort)
  }, [refresh, sort])

  useEffect(() => {
    if (!isCommunityEnabled) return
    let cancelled = false
    void (async () => {
      // Only look up likes for browsers that already have an anonymous
      // session; plain visitors should not create auth users.
      const userId = await getCurrentUserId()
      if (!userId || cancelled) return
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
  }, [])

  const handleOpen = (item: CommunityProject) => {
    navigate(`/community/${item.id}`)
  }

  const handleToggleLike = async (item: CommunityProject) => {
    if (likePendingIds.has(item.id)) return
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
      setError(err instanceof Error ? err.message : 'Could not update the like.')
    } finally {
      setLikePendingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  return (
    <div className="gallery-page">
      <header className="gallery-page-header">
        <div className="gallery-page-header-text">
          <p className="gallery-page-eyebrow">Straw Mobile Designer</p>
          <h1 className="gallery-page-title">Community</h1>
          <p className="gallery-page-subtitle">
            Mobiles published by other builders. Open one to preview it in the designer, then
            duplicate a copy into your gallery to remix.
          </p>
        </div>
        <div className="gallery-page-header-actions">
          <Link to="/gallery" className="ghost-button gallery-page-action">
            My gallery
          </Link>
          <Link to="/" className="ghost-button gallery-page-action gallery-page-back">
            Back to designer
          </Link>
        </div>
      </header>

      {isCommunityEnabled && (
        <div className="community-toolbar">
          <div className="community-sort" role="group" aria-label="Sort community mobiles">
            <button
              type="button"
              className={`community-sort-button${sort === 'recent' ? ' is-active' : ''}`}
              aria-pressed={sort === 'recent'}
              onClick={() => setSort('recent')}
            >
              Recent
            </button>
            <button
              type="button"
              className={`community-sort-button${sort === 'liked' ? ' is-active' : ''}`}
              aria-pressed={sort === 'liked'}
              onClick={() => setSort('liked')}
            >
              Most liked
            </button>
          </div>
        </div>
      )}

      {error && <p className="gallery-error gallery-page-error">{error}</p>}

      {!isCommunityEnabled ? (
        <div className="gallery-page-empty">
          <p className="panel-hint">The community gallery is not configured for this build.</p>
          <p className="panel-hint">
            Your local gallery and the designer still work — community sharing just needs a
            Supabase project (see the README).
          </p>
          <Link to="/gallery" className="primary-button gallery-page-action gallery-page-empty-cta">
            Back to my gallery
          </Link>
        </div>
      ) : projects === null ? (
        <p className="community-status">Loading community mobiles…</p>
      ) : projects.length === 0 ? (
        <div className="gallery-page-empty">
          <p className="panel-hint">Nothing here yet.</p>
          <p className="panel-hint">
            Be the first: open your gallery and hit Publish on a mobile you like.
          </p>
          <Link to="/gallery" className="primary-button gallery-page-action gallery-page-empty-cta">
            Open my gallery
          </Link>
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
                  aria-label={`Preview ${item.name}`}
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
                      {formatRelativeDate(item.publishedAt)}
                    </span>
                  </div>
                  <div className="gallery-item-actions">
                    <button
                      type="button"
                      className="gallery-item-button"
                      onClick={() => handleOpen(item)}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className={`gallery-item-button community-like-button${liked ? ' is-liked' : ''}`}
                      aria-pressed={liked}
                      aria-label={liked ? `Unlike ${item.name}` : `Like ${item.name}`}
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
    </div>
  )
}
