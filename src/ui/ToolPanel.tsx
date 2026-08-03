import { useEffect } from 'react'
import { useStrawMobileStore, type ActiveTool } from '../state/store'

const TOOLS: { id: ActiveTool; label: string; title: string }[] = [
  { id: 'select', label: 'Select', title: 'Select, drag, and connect corners' },
  { id: 'scissors', label: 'Scissors', title: 'Click a straw to cut it (prebuilt shapes remove entirely)' },
]

/** Select vs scissors tool toggle; Escape returns to select. */
export function ToolPanel() {
  const activeTool = useStrawMobileStore((s) => s.activeTool)
  const setActiveTool = useStrawMobileStore((s) => s.setActiveTool)

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
    <div className="panel">
      <h2 className="panel-title">Tools</h2>
      <div className="segmented" role="group" aria-label="Edit tool">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`segmented-option${activeTool === tool.id ? ' is-active' : ''}`}
            title={tool.title}
            onClick={() => setActiveTool(tool.id)}
          >
            {tool.label}
          </button>
        ))}
      </div>
      <p className="panel-hint">
        {activeTool === 'scissors'
          ? 'Click any straw to cut it. Prebuilt shapes are removed entirely. Escape returns to Select.'
          : 'Select free shapes to drag them, or click corners to tie thread.'}
      </p>
    </div>
  )
}
