import { useStrawMobileStore } from '../state/store'

/** Short status text guiding the click-corner, click-corner connect flow. */
export function ConnectionHint() {
  const pendingVertex = useStrawMobileStore((s) => s.pendingVertex)
  const shapeCount = useStrawMobileStore((s) => s.shapes.length)

  let message: string
  if (shapeCount === 0) {
    message =
      'Drag a shape from the toolbar onto the scene, or click to add one in view. Tie a corner to the ceiling hook to hang it under gravity.'
  } else if (pendingVertex) {
    message =
      pendingVertex.kind === 'anchor'
        ? 'Now click a shape corner to hang it from the ceiling hook under gravity.'
        : 'Now click another corner — or the ceiling hook — to tie a thread. Pieces on the hook chain hang and sway under gravity.'
  } else {
    message =
      'Click a corner, then the ceiling hook (or another corner) to connect thread. Free pieces stay put until they join the hook chain — then gravity takes over. Click a free straw body to select & drag it.'
  }

  return (
    <div className="panel hint-panel">
      <p className="panel-hint">{message}</p>
    </div>
  )
}
