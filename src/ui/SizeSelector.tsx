import { useEffect, type ReactNode } from 'react'
import { useT } from '../i18n/t'
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
  const t = useT()
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
    <div className="hud-cluster hud-middle-right" role="toolbar" aria-label={t('size.toolbar')}>
      <div className="hud-tool-group" role="radiogroup" aria-label={t('size.group')}>
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
      <div className="hud-tool-group" role="group" aria-label={t('size.modes')}>
        <button
          type="button"
          className={`hud-icon-button hud-threads${threadsActive ? ' is-active' : ''}`}
          title={t('size.threadsTitle')}
          aria-label={t('size.threadsLabel')}
          aria-pressed={threadsActive}
          onClick={() => setActiveTool('threads')}
        >
          <ThreadsIcon className="hud-icon" />
        </button>
        <button
          type="button"
          className={`hud-icon-button hud-select${selectActive ? ' is-active' : ''}`}
          title={selectActive ? t('size.selectExitTitle') : t('size.selectEnterTitle')}
          aria-label={selectActive ? t('size.selectDisable') : t('size.selectEnable')}
          aria-pressed={selectActive}
          onClick={() => setActiveTool(selectActive ? 'threads' : 'select')}
        >
          <SelectIcon className="hud-icon" />
        </button>
        <button
          type="button"
          className={`hud-icon-button hud-scissors${scissorsActive ? ' is-active' : ''}`}
          title={scissorsActive ? t('size.scissorsDisableTitle') : t('size.scissorsEnableTitle')}
          aria-label={scissorsActive ? t('size.scissorsDisable') : t('size.scissorsEnable')}
          aria-pressed={scissorsActive}
          onClick={() => setActiveTool(scissorsActive ? 'threads' : 'scissors')}
        >
          <ScissorsIcon className="hud-icon" />
        </button>
      </div>
    </div>
  )
}
