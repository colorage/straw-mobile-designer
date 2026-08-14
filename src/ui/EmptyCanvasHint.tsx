import { useT } from '../i18n/t'
import { useStrawMobileStore } from '../state/store'

/** Centered soft tip when the designer scene has no shapes. */
export function EmptyCanvasHint() {
  const t = useT()
  const shapeCount = useStrawMobileStore((s) => s.shapes.length)
  const isPreviewMode = useStrawMobileStore((s) => s.isPreviewMode)

  if (isPreviewMode || shapeCount > 0) return null

  return (
    <div className="hud-cluster hud-center" aria-live="polite">
      <div className="hud-empty-hint">
        <p className="hud-empty-hint-primary">{t('empty.primary')}</p>
        <p className="hud-empty-hint-secondary">{t('empty.secondary')}</p>
        <p className="hud-empty-hint-tertiary">{t('empty.tertiary')}</p>
      </div>
    </div>
  )
}
