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
    message = 'Add a shape from the toolbar to get started.'
  } else if (pendingVertex) {
    message = 'Now click another corner (or the ceiling hook) to tie a thread between them.'
  } else {
    message = 'Click a corner, then click another corner to connect them with thread.'
  }

  return (
    <div className="panel hint-panel">
      <p className="panel-hint">{message}</p>
    </div>
  )
}
