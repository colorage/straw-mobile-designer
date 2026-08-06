import { useEffect, type ReactNode } from 'react'
import { STRAW_SIZES, STRAW_SIZE_LABELS, type StrawSize } from '../state/types'
import { useStrawMobileStore } from '../state/store'
import {
  ScissorsIcon,
  SelectIcon,
  SizeHalfIcon,
  SizeOneIcon,
  SizeQuarterIcon,
  ThreadsIcon,
} from './icons'

const SIZE_ICONS: Record<StrawSize, ReactNode> = {
  1: <SizeOneIcon className="hud-icon" />,
  0.5: <SizeHalfIcon className="hud-icon" />,
  0.25: <SizeQuarterIcon className="hud-icon" />,
}

/** Middle-right: straw-cut length + threads / select / scissors modes. */
export function SizeSelector() {
  const strawSize = useStrawMobileStore((s) => s.strawSize)
  const setStrawSize = useStrawMobileStore((s) => s.setStrawSize)
  const activeTool = useStrawMobileStore((s) => s.activeTool)
  const setActiveTool = useStrawMobileStore((s) => s.setActiveTool)
  const threadsActive = activeTool === 'threads'
  const selectActive = activeTool === 'select'
  const scissorsActive = activeTool === 'scissors'

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (useStrawMobileStore.getState().activeTool === 'threads') return
      event.preventDefault()
      setActiveTool('threads')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTool])

  return (
    <div className="hud-cluster hud-middle-right" role="toolbar" aria-label="Size and mode tools">
      <div className="hud-tool-group" role="radiogroup" aria-label="Straw size">
        {STRAW_SIZES.map((size) => {
          const selected = strawSize === size
          const label = STRAW_SIZE_LABELS[size]
          return (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              className={`hud-size-button${selected ? ' is-selected' : ''}`}
              onClick={() => setStrawSize(size)}
            >
              {SIZE_ICONS[size]}
            </button>
          )
        })}
      </div>
      <div className="hud-tool-group" role="group" aria-label="Interaction modes">
        <button
          type="button"
          className={`hud-icon-button hud-threads${threadsActive ? ' is-active' : ''}`}
          title="Threads mode — click corners to connect shapes"
          aria-label="Threads mode — connect shapes"
          aria-pressed={threadsActive}
          onClick={() => setActiveTool('threads')}
        >
          <ThreadsIcon className="hud-icon" />
        </button>
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
          onClick={() => setActiveTool(selectActive ? 'threads' : 'select')}
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
          onClick={() => setActiveTool(scissorsActive ? 'threads' : 'scissors')}
        >
          <ScissorsIcon className="hud-icon" />
        </button>
      </div>
    </div>
  )
}
