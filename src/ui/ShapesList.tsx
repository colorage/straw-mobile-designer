import { useEffect } from 'react'
import { SHAPE_LABELS } from '../geometry/primitives'
import { useStrawMobileStore } from '../state/store'
import { STRAW_SIZE_LABELS } from '../state/types'

/** Sidebar list of every shape on the workbench, with a button to remove each one. */
export function ShapesList() {
  const shapes = useStrawMobileStore((s) => s.shapes)
  const selectedShapeIds = useStrawMobileStore((s) => s.selectedShapeIds)
  const selectShape = useStrawMobileStore((s) => s.selectShape)
  const selectShapeRange = useStrawMobileStore((s) => s.selectShapeRange)
  const removeShapes = useStrawMobileStore((s) => s.removeShapes)
  const duplicateSelection = useStrawMobileStore((s) => s.duplicateSelection)
  const hasSelection = selectedShapeIds.length > 0
  const selectedSet = new Set(selectedShapeIds)

  // Let Delete/Backspace remove every shape currently selected.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (selectedShapeIds.length === 0) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      event.preventDefault()
      removeShapes(selectedShapeIds)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedShapeIds, removeShapes])

  return (
    <div className="panel">
      <div className="panel-title-row">
        <h2 className="panel-title">Shapes on Workbench</h2>
        <button
          type="button"
          className="ghost-button"
          disabled={!hasSelection}
          onClick={() => duplicateSelection()}
          title="Duplicate (Ctrl/Cmd+D)"
        >
          Duplicate
        </button>
      </div>
      {shapes.length === 0 ? (
        <p className="panel-hint">No shapes yet — add one from the toolbar.</p>
      ) : (
        <ul className="inventory-list">
          {shapes.map((shape) => (
            <li
              key={shape.id}
              className={`shape-row${selectedSet.has(shape.id) ? ' is-selected' : ''}`}
              onClick={(event) => {
                if (event.shiftKey) {
                  selectShapeRange(shape.id)
                  return
                }
                selectShape(shape.id)
              }}
            >
              <span className="shape-row-label">
                {SHAPE_LABELS[shape.kind]} · {STRAW_SIZE_LABELS[shape.size]}
              </span>
              <button
                type="button"
                className="shape-row-delete"
                aria-label={`Remove ${SHAPE_LABELS[shape.kind]}`}
                onClick={(event) => {
                  event.stopPropagation()
                  removeShapes([shape.id])
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
