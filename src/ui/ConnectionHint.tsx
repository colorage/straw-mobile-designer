import { useStrawMobileStore } from '../state/store'

/** Short status text guiding the click-corner, click-corner connect flow. */
export function ConnectionHint() {
  const pendingVertex = useStrawMobileStore((s) => s.pendingVertex)
  const overlapSuggest = useStrawMobileStore((s) => s.overlapSuggest)
  const shapeCount = useStrawMobileStore((s) => s.shapes.length)
  const activeTool = useStrawMobileStore((s) => s.activeTool)

  let message: string
  if (activeTool === 'scissors') {
    message =
      'Click a straw to cut it. Prebuilt shapes are removed entirely. Escape returns to Select.'
  } else if (shapeCount === 0) {
    message =
      'Drag a shape from the toolbar onto the scene, or click to add one in view. Tie a corner to the ceiling hook to hang it under gravity.'
  } else if (overlapSuggest) {
    message =
      'Holding corners together… connecting soon. Move them apart to cancel, or wait a moment to tie the thread.'
  } else if (pendingVertex) {
    message =
      pendingVertex.kind === 'anchor'
        ? 'Now click a shape corner to hang it from the ceiling hook under gravity.'
        : 'Now click another corner — or the ceiling hook — to tie a thread. Connected free pieces tighten together; the hook chain hangs under gravity.'
  } else {
    message =
      'Click a corner, then another corner (or the ceiling hook) to connect thread — or hold two corners together for a couple of seconds to auto-tie (works for free pieces and for free ends of hanging straws once they settle). Free pieces pull together as the thread tightens — a cycle of straws forms a polygon on the workbench. Pieces on the hook chain hang and sway under gravity. Click a free straw body to select & drag it.'
  }

  return (
    <div className="panel hint-panel">
      <p className="panel-hint">{message}</p>
    </div>
  )
}
