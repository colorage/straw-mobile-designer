import { useEffect } from 'react'
import { useStrawMobileStore } from '../state/store'
import { RedoIcon, UndoIcon } from './icons'

/** Bottom-left undo / redo controls and global designer keyboard shortcuts. */
export function ModeBar() {
  const undo = useStrawMobileStore((s) => s.undo)
  const redo = useStrawMobileStore((s) => s.redo)
  const canUndo = useStrawMobileStore((s) => s.past.length > 0)
  const canRedo = useStrawMobileStore((s) => s.future.length > 0)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const { selectedShapeIds, removeShapes } = useStrawMobileStore.getState()
        if (selectedShapeIds.length === 0) return
        event.preventDefault()
        removeShapes(selectedShapeIds)
        return
      }

      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      const key = event.key.toLowerCase()
      if (key === 'd') {
        event.preventDefault()
        useStrawMobileStore.getState().duplicateSelection()
        return
      }
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        useStrawMobileStore.getState().undo()
        return
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        useStrawMobileStore.getState().redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="hud-cluster hud-bottom-left" role="group" aria-label="History">
      <button
        type="button"
        className="hud-icon-button"
        disabled={!canUndo}
        onClick={() => undo()}
        title="Undo (Ctrl/Cmd+Z)"
        aria-label="Undo"
      >
        <UndoIcon className="hud-icon" />
      </button>
      <button
        type="button"
        className="hud-icon-button"
        disabled={!canRedo}
        onClick={() => redo()}
        title="Redo (Ctrl/Cmd+Shift+Z)"
        aria-label="Redo"
      >
        <RedoIcon className="hud-icon" />
      </button>
    </div>
  )
}
