import { useEffect, type ReactNode } from 'react'
import { SHAPE_LABELS, type ShapeKind } from '../geometry/primitives'
import { SHAPE_DRAG_MIME, SHAPE_DRAG_TEXT_MIME } from '../scene/canvasBridge'
import { useStrawMobileStore } from '../state/store'
import {
  OctahedronIcon,
  PlusIcon,
  PyramidIcon,
  ScissorsIcon,
  SquareIcon,
  TriangleIcon,
} from './icons'

type ToolbarShapeKind = Exclude<ShapeKind, 'tetrahedron'>

const SHAPE_GROUPS: ToolbarShapeKind[][] = [
  ['straw'],
  ['triangle', 'square'],
  ['squarePyramid', 'octahedron'],
]

const SHAPE_ICONS: Record<ToolbarShapeKind, ReactNode> = {
  straw: <PlusIcon className="hud-icon" />,
  triangle: <TriangleIcon className="hud-icon" />,
  square: <SquareIcon className="hud-icon" />,
  squarePyramid: <PyramidIcon className="hud-icon" />,
  octahedron: <OctahedronIcon className="hud-icon" />,
}

/** Middle-left floating toolbar: add shapes + scissors toggle. */
export function Toolbar() {
  const addShape = useStrawMobileStore((s) => s.addShape)
  const activeTool = useStrawMobileStore((s) => s.activeTool)
  const setActiveTool = useStrawMobileStore((s) => s.setActiveTool)
  const scissorsActive = activeTool === 'scissors'

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (useStrawMobileStore.getState().activeTool === 'select') return
      event.preventDefault()
      setActiveTool('select')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTool])

  return (
    <div className="hud-cluster hud-middle-left" role="toolbar" aria-label="Shape tools">
      {SHAPE_GROUPS.map((group, groupIndex) => (
        <div key={groupIndex} className="hud-tool-group">
          {group.map((kind) => (
            <button
              key={kind}
              type="button"
              className="hud-icon-button"
              draggable
              title={`Add ${SHAPE_LABELS[kind]}`}
              aria-label={`Add ${SHAPE_LABELS[kind]}`}
              onClick={() => addShape(kind)}
              onDragStart={(event) => {
                event.dataTransfer.setData(SHAPE_DRAG_MIME, kind)
                event.dataTransfer.setData(SHAPE_DRAG_TEXT_MIME, kind)
                event.dataTransfer.effectAllowed = 'copy'
              }}
            >
              {SHAPE_ICONS[kind]}
            </button>
          ))}
        </div>
      ))}
      <div className="hud-tool-group">
        <button
          type="button"
          className={`hud-icon-button hud-scissors${scissorsActive ? ' is-active' : ''}`}
          title={
            scissorsActive
              ? 'Disable scissors mode (Escape)'
              : 'Enable scissors mode — click a straw to cut it'
          }
          aria-label={scissorsActive ? 'Disable scissors mode' : 'Enable scissors mode'}
          aria-pressed={scissorsActive}
          onClick={() => setActiveTool(scissorsActive ? 'select' : 'scissors')}
        >
          <ScissorsIcon className="hud-icon" />
        </button>
      </div>
    </div>
  )
}
