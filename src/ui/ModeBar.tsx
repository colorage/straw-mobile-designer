import { useEffect } from 'react'
import { useGalleryStore } from '../gallery/galleryStore'
import { useStrawMobileStore } from '../state/store'

/** Project-level actions (undo / redo / reset). */
export function ModeBar() {
  const undo = useStrawMobileStore((s) => s.undo)
  const redo = useStrawMobileStore((s) => s.redo)
  const canUndo = useStrawMobileStore((s) => s.past.length > 0)
  const canRedo = useStrawMobileStore((s) => s.future.length > 0)
  const reset = useStrawMobileStore((s) => s.reset)
  const clearActive = useGalleryStore((s) => s.clearActive)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

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
    <div className="panel">
      <h2 className="panel-title">Project</h2>
      <div className="project-actions">
        <button
          type="button"
          className="ghost-button"
          disabled={!canUndo}
          onClick={() => undo()}
          title="Undo (Ctrl/Cmd+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={!canRedo}
          onClick={() => redo()}
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          Redo
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            if (window.confirm('Clear the whole mobile (including the autosaved copy) and start over?')) {
              reset()
              clearActive()
            }
          }}
        >
          Reset
        </button>
      </div>
    </div>
  )
}
