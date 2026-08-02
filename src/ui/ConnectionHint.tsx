import { useStrawMobileStore } from '../state/store'

/** Short status text guiding the click-corner, click-corner connect flow. */
export function ConnectionHint() {
  const pendingVertex = useStrawMobileStore((s) => s.pendingVertex)
  const shapeCount = useStrawMobileStore((s) => s.shapes.length)

  let message: string
  if (shapeCount === 0) {
    message = 'Drag a shape from the toolbar onto the scene, or click to add one in view.'
  } else if (pendingVertex) {
    message = 'Now click another corner (or the ceiling hook) to tie a thread between them.'
  } else {
    message =
      'Drag shapes from the toolbar onto the scene. Click a corner to connect thread — pieces hang once tied into the hook chain. Click a free straw body to select & drag it.'
  }

  return (
    <div className="panel hint-panel">
      <p className="panel-hint">{message}</p>
    </div>
  )
}
