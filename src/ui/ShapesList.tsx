import { useEffect } from 'react'
import { SHAPE_LABELS } from '../geometry/primitives'
import { useStrawMobileStore } from '../state/store'
import { STRAW_SIZE_LABELS } from '../state/types'

/** Sidebar list of every shape on the workbench, with a button to remove each one. */
export function ShapesList() {
  const shapes = useStrawMobileStore((s) => s.shapes)
  const mode = useStrawMobileStore((s) => s.mode)
  const selectedShapeId = useStrawMobileStore((s) => s.selectedShapeId)
  const selectShape = useStrawMobileStore((s) => s.selectShape)
  const removeShape = useStrawMobileStore((s) => s.removeShape)
  const disabled = mode !== 'build'

  // Let Delete/Backspace remove whichever shape is currently picked up for dragging.
  useEffect(() => {
    if (disabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (!selectedShapeId) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      event.preventDefault()
      removeShape(selectedShapeId)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disabled, selectedShapeId, removeShape])

  return (
    <div className="panel">
      <h2 className="panel-title">Shapes on Workbench</h2>
      {shapes.length === 0 ? (
        <p className="panel-hint">No shapes yet — add one from the toolbar.</p>
      ) : (
        <ul className="inventory-list">
          {shapes.map((shape) => (
            <li
              key={shape.id}
              className={`shape-row${shape.id === selectedShapeId ? ' is-selected' : ''}`}
              onClick={() => !disabled && selectShape(shape.id)}
            >
              <span className="shape-row-label">
                {SHAPE_LABELS[shape.kind]} · {STRAW_SIZE_LABELS[shape.size]}
              </span>
              <button
                type="button"
                className="shape-row-delete"
                aria-label={`Remove ${SHAPE_LABELS[shape.kind]}`}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation()
                  removeShape(shape.id)
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
