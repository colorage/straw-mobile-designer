import { useEffect, type ReactNode } from 'react'
import { SHAPE_LABELS, type ShapeKind } from '../geometry/primitives'
import { SHAPE_DRAG_MIME, SHAPE_DRAG_TEXT_MIME } from '../scene/canvasBridge'
import { useStrawMobileStore, type SlotIndex } from '../state/store'
import {
  OctahedronIcon,
  PlusIcon,
  PyramidIcon,
  ScissorsIcon,
  SelectIcon,
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

const SLOT_INDEXES: SlotIndex[] = [0, 1, 2]

/** Middle-left floating toolbar: add shapes + select / scissors + selection buffers. */
export function Toolbar() {
  const addShape = useStrawMobileStore((s) => s.addShape)
  const activeTool = useStrawMobileStore((s) => s.activeTool)
  const setActiveTool = useStrawMobileStore((s) => s.setActiveTool)
  const applySlotBuffer = useStrawMobileStore((s) => s.useSlotBuffer)
  const slots = useStrawMobileStore((s) => s.slots)
  const hasSelection = useStrawMobileStore((s) => s.selectedShapeIds.length > 0)
  const selectActive = activeTool === 'select'
  const scissorsActive = activeTool === 'scissors'

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (useStrawMobileStore.getState().activeTool === 'none') return
      event.preventDefault()
      setActiveTool('none')
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
              onClick={() => {
                // Shape tools leave cut mode so the new piece can be selected/edited.
                if (scissorsActive) setActiveTool('select')
                addShape(kind)
              }}
              onDragStart={(event) => {
                if (scissorsActive) setActiveTool('select')
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
          className={`hud-icon-button hud-select${selectActive ? ' is-active' : ''}`}
          title={
            selectActive
              ? 'Exit selection mode — click empty space or press Escape'
              : 'Selection mode — click or drag a rectangle to select'
          }
          aria-label={selectActive ? 'Disable selection mode' : 'Enable selection mode'}
          aria-pressed={selectActive}
          onClick={() => setActiveTool(selectActive ? 'none' : 'select')}
        >
          <SelectIcon className="hud-icon" />
        </button>
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
          onClick={() => setActiveTool(scissorsActive ? 'none' : 'scissors')}
        >
          <ScissorsIcon className="hud-icon" />
        </button>
      </div>
      <div className="hud-tool-group" role="group" aria-label="Selection buffers">
        {SLOT_INDEXES.map((slot) => {
          const occupied = slots[slot] !== null
          const label = String(slot + 1)
          const title = hasSelection
            ? `Store selection in slot ${label}`
            : occupied
              ? `Paste slot ${label} into the scene`
              : `Slot ${label} is empty`
          return (
            <button
              key={slot}
              type="button"
              className={`hud-icon-button hud-slot-button${occupied ? ' is-occupied' : ''}`}
              title={title}
              aria-label={title}
              disabled={!hasSelection && !occupied}
              onClick={() => applySlotBuffer(slot)}
            >
              <span className="hud-slot-label">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
