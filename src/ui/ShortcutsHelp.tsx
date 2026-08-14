import { useEffect } from 'react'
import { useStrawMobileStore } from '../state/store'
import { useHelpPanelStore } from './helpPanelStore'

type ShortcutRow = {
  keys: string[]
  label: string
}

const KEYBOARD_SHORTCUTS: ShortcutRow[] = [
  { keys: ['Ctrl/Cmd', 'Z'], label: 'Undo' },
  { keys: ['Ctrl/Cmd', 'Shift', 'Z'], label: 'Redo' },
  { keys: ['Ctrl/Cmd', 'Y'], label: 'Redo (alternate)' },
  { keys: ['Ctrl/Cmd', 'D'], label: 'Duplicate selection' },
  { keys: ['Delete'], label: 'Remove selected shapes' },
  { keys: ['Backspace'], label: 'Remove selected shapes' },
  { keys: ['Esc'], label: 'Exit select or scissors mode' },
  { keys: ['?'], label: 'Toggle this shortcuts panel' },
]

const BUILD_TIPS: string[] = [
  'Click a corner, then another corner (or the ceiling hook) to tie a thread.',
  'Hold two corners overlapping to auto-connect when the magnet scanner is on.',
  'Use scissors to cut a straw; select mode to move pieces (drag empty space to marquee).',
  'Slots 1–3 store and paste a selection buffer from the left toolbar.',
]

/** Designer shortcuts overlay — toggled by the HUD ? button or the ? key. */
export function ShortcutsHelp() {
  const isOpen = useHelpPanelStore((s) => s.open)
  const hide = useHelpPanelStore((s) => s.hide)
  const toggle = useHelpPanelStore((s) => s.toggle)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (useStrawMobileStore.getState().isPreviewMode) return

      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (event.key === 'Escape' && useHelpPanelStore.getState().open) {
        event.preventDefault()
        hide()
        return
      }

      // "?" from Shift+/ or literal "?" — ignore when a modifier other than Shift is held.
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        toggle()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      hide()
    }
  }, [hide, toggle])

  if (!isOpen) return null

  return (
    <div
      className="help-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) hide()
      }}
    >
      <div
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Shortcuts and build tips"
      >
        <div className="help-dialog-head">
          <h2 className="help-dialog-title">Shortcuts</h2>
          <button type="button" className="help-close" onClick={hide} aria-label="Close">
            ×
          </button>
        </div>

        <section className="help-section" aria-labelledby="help-keyboard-heading">
          <h3 id="help-keyboard-heading" className="help-section-title">
            Keyboard
          </h3>
          <ul className="help-shortcut-list">
            {KEYBOARD_SHORTCUTS.map((row) => (
              <li key={`${row.label}-${row.keys.join('+')}`} className="help-shortcut-row">
                <span className="help-shortcut-keys">
                  {row.keys.map((key) => (
                    <kbd key={key} className="help-kbd">
                      {key}
                    </kbd>
                  ))}
                </span>
                <span className="help-shortcut-label">{row.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="help-section" aria-labelledby="help-build-heading">
          <h3 id="help-build-heading" className="help-section-title">
            Build
          </h3>
          <ul className="help-tip-list">
            {BUILD_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
