type PreviewHudProps = {
  title: string
  likesCount: number
  liked: boolean
  likeDisabled?: boolean
  duplicateDisabled?: boolean
  onLike: () => void
  onDuplicate: () => void
  onBack: () => void
  error: string | null
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="community-like-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
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

/** Slim HUD for community preview: title, like, duplicate, back — no edit tools. */
export function PreviewHud({
  title,
  likesCount,
  liked,
  likeDisabled,
  duplicateDisabled,
  onLike,
  onDuplicate,
  onBack,
  error,
}: PreviewHudProps) {
  return (
    <>
      <div className="hud-cluster hud-top-left preview-hud-title">
        <p className="preview-hud-eyebrow">Community preview</p>
        <h1 className="preview-hud-name">{title || 'Untitled'}</h1>
      </div>

      <div className="hud-cluster hud-top-right preview-hud-actions">
        <button
          type="button"
          className={`ghost-button gallery-page-action community-like-button preview-hud-like${liked ? ' is-liked' : ''}`}
          aria-pressed={liked}
          aria-label={liked ? `Unlike ${title}` : `Like ${title}`}
          disabled={likeDisabled}
          onClick={onLike}
        >
          <HeartIcon filled={liked} />
          <span>{likesCount}</span>
        </button>
        <button
          type="button"
          className="primary-button gallery-page-action"
          disabled={duplicateDisabled}
          onClick={onDuplicate}
        >
          {duplicateDisabled ? 'Duplicating…' : 'Duplicate to my gallery'}
        </button>
        <button type="button" className="ghost-button gallery-page-action" onClick={onBack}>
          Back to gallery
        </button>
      </div>

      {error && <p className="preview-hud-error">{error}</p>}
    </>
  )
}
