import { useEffect } from 'react'
import { useT, type MessageKey } from '../i18n/t'
import { useStrawMobileStore } from '../state/store'
import { useHelpPanelStore } from './helpPanelStore'

type ShortcutRow = {
  keys: string[]
  labelKey: MessageKey
}

const KEYBOARD_SHORTCUTS: ShortcutRow[] = [
  { keys: ['Ctrl/Cmd', 'Z'], labelKey: 'help.undo' },
  { keys: ['Ctrl/Cmd', 'Shift', 'Z'], labelKey: 'help.redo' },
  { keys: ['Ctrl/Cmd', 'Y'], labelKey: 'help.redoAlt' },
  { keys: ['Ctrl/Cmd', 'D'], labelKey: 'help.duplicate' },
  { keys: ['Delete'], labelKey: 'help.remove' },
  { keys: ['Backspace'], labelKey: 'help.remove' },
  { keys: ['Esc'], labelKey: 'help.escape' },
  { keys: ['?'], labelKey: 'help.toggle' },
]

const BUILD_TIP_KEYS: MessageKey[] = [
  'help.tipThread',
  'help.tipMagnet',
  'help.tipScissors',
  'help.tipSlots',
]

/** Designer shortcuts overlay — toggled by the HUD ? button or the ? key. */
export function ShortcutsHelp() {
  const t = useT()
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
        aria-label={t('help.dialog')}
      >
        <div className="help-dialog-head">
          <h2 className="help-dialog-title">{t('help.title')}</h2>
          <button type="button" className="help-close" onClick={hide} aria-label={t('account.close')}>
            ×
          </button>
        </div>

        <section className="help-section" aria-labelledby="help-keyboard-heading">
          <h3 id="help-keyboard-heading" className="help-section-title">
            {t('help.keyboard')}
          </h3>
          <ul className="help-shortcut-list">
            {KEYBOARD_SHORTCUTS.map((row) => (
              <li key={`${row.labelKey}-${row.keys.join('+')}`} className="help-shortcut-row">
                <span className="help-shortcut-keys">
                  {row.keys.map((key) => (
                    <kbd key={key} className="help-kbd">
                      {key}
                    </kbd>
                  ))}
                </span>
                <span className="help-shortcut-label">{t(row.labelKey)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="help-section" aria-labelledby="help-build-heading">
          <h3 id="help-build-heading" className="help-section-title">
            {t('help.build')}
          </h3>
          <ul className="help-tip-list">
            {BUILD_TIP_KEYS.map((tipKey) => (
              <li key={tipKey}>{t(tipKey)}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
