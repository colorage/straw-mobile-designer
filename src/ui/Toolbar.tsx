import type { ReactNode } from 'react'
import type { PrimitiveKind } from '../geometry/primitives'
import type { MessageKey } from '../i18n/t'
import { useT } from '../i18n/t'
import { SHAPE_DRAG_MIME, SHAPE_DRAG_TEXT_MIME } from '../scene/canvasBridge'
import { useStrawMobileStore, type SlotIndex } from '../state/store'
import {
  OctahedronIcon,
  PlusIcon,
  PyramidIcon,
  SquareIcon,
  TriangleIcon,
} from './icons'

type ToolbarShapeKind = Exclude<PrimitiveKind, 'tetrahedron'>

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

const SHAPE_NAME_KEYS: Record<ToolbarShapeKind, MessageKey> = {
  straw: 'shapes.straw',
  triangle: 'shapes.triangle',
  square: 'shapes.square',
  squarePyramid: 'shapes.squarePyramid',
  octahedron: 'shapes.octahedron',
}

const SLOT_INDEXES: SlotIndex[] = [0, 1, 2]

/** Middle-left floating toolbar: add shapes + selection buffers. */
export function Toolbar() {
  const t = useT()
  const addShape = useStrawMobileStore((s) => s.addShape)
  const activeTool = useStrawMobileStore((s) => s.activeTool)
  const setActiveTool = useStrawMobileStore((s) => s.setActiveTool)
  const applySlotBuffer = useStrawMobileStore((s) => s.useSlotBuffer)
  const slots = useStrawMobileStore((s) => s.slots)
  const hasSelection = useStrawMobileStore((s) => s.selectedShapeIds.length > 0)
  const scissorsActive = activeTool === 'scissors'

  return (
    <div className="hud-cluster hud-middle-left" role="toolbar" aria-label={t('toolbar.shapeTools')}>
      {SHAPE_GROUPS.map((group, groupIndex) => (
        <div key={groupIndex} className="hud-tool-group">
          {group.map((kind) => {
            const addLabel = t('toolbar.addShape', { name: t(SHAPE_NAME_KEYS[kind]) })
            return (
              <button
                key={kind}
                type="button"
                className="hud-icon-button"
                draggable
                title={addLabel}
                aria-label={addLabel}
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
            )
          })}
        </div>
      ))}
      <div className="hud-tool-group" role="group" aria-label={t('toolbar.selectionBuffers')}>
        {SLOT_INDEXES.map((slot) => {
          const occupied = slots[slot] !== null
          const label = String(slot + 1)
          const title = hasSelection
            ? t('toolbar.storeSlot', { label })
            : occupied
              ? t('toolbar.pasteSlot', { label })
              : t('toolbar.emptySlot', { label })
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
