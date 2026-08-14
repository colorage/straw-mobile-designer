import { useStrawMobileStore } from '../state/store'

/** Centered soft tip when the designer scene has no shapes. */
export function EmptyCanvasHint() {
  const shapeCount = useStrawMobileStore((s) => s.shapes.length)
  const isPreviewMode = useStrawMobileStore((s) => s.isPreviewMode)

  if (isPreviewMode || shapeCount > 0) return null

  return (
    <div className="hud-cluster hud-center" aria-live="polite">
      <div className="hud-empty-hint">
        <p className="hud-empty-hint-primary">
          Drag a shape from the toolbar onto the scene, or click to add one in view.
        </p>
        <p className="hud-empty-hint-secondary">
          Tie a corner to the ceiling hook to hang it under gravity.
        </p>
        <p className="hud-empty-hint-tertiary">Press ? for shortcuts</p>
      </div>
    </div>
  )
}
