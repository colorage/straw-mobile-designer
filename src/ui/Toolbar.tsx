import { SHAPE_LABELS, type ShapeKind } from '../geometry/primitives'
import { SHAPE_DRAG_MIME, SHAPE_DRAG_TEXT_MIME } from '../scene/canvasBridge'
import { useStrawMobileStore } from '../state/store'

const SHAPE_ORDER: ShapeKind[] = ['straw', 'tetrahedron', 'squarePyramid', 'octahedron']

const SHAPE_ICONS: Record<ShapeKind, string> = {
  straw: '│',
  tetrahedron: '△',
  squarePyramid: '▲',
  octahedron: '◇',
}

/** Buttons for adding the four building-block primitives to the workbench. */
export function Toolbar() {
  const addShape = useStrawMobileStore((s) => s.addShape)

  return (
    <div className="panel">
      <h2 className="panel-title">Add Shapes</h2>
      <div className="toolbar-grid">
        {SHAPE_ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            className="toolbar-button"
            draggable
            onClick={() => addShape(kind)}
            onDragStart={(event) => {
              event.dataTransfer.setData(SHAPE_DRAG_MIME, kind)
              event.dataTransfer.setData(SHAPE_DRAG_TEXT_MIME, kind)
              event.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <span className="toolbar-icon" aria-hidden>
              {SHAPE_ICONS[kind]}
            </span>
            <span>{SHAPE_LABELS[kind]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
