import { useStrawMobileStore } from '../state/store'

/** Short status text guiding the click-corner, click-corner connect flow. */
export function ConnectionHint() {
  const mode = useStrawMobileStore((s) => s.mode)
  const pendingVertex = useStrawMobileStore((s) => s.pendingVertex)
  const shapeCount = useStrawMobileStore((s) => s.shapes.length)

  let message: string
  if (mode === 'simulate') {
    message = 'Simulating — watch it hang and balance. Go back to Build to keep editing.'
  } else if (shapeCount === 0) {
    message = 'Drag a shape from the toolbar onto the scene, or click to add one on the grid.'
  } else if (pendingVertex) {
    message = 'Now click another corner (or the ceiling hook) to tie a thread between them.'
  } else {
    message =
      'Drag shapes from the toolbar onto the scene. Click a corner to connect thread. Click a straw body to select & drag it. Delete via the list or Backspace.'
  }

  return (
    <div className="panel hint-panel">
      <p className="panel-hint">{message}</p>
    </div>
  )
}
