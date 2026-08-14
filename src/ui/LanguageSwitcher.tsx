import { useEffect, useId, useRef, useState } from 'react'
import { LOCALES, LOCALE_META } from '../i18n/locales'
import { useLocaleStore } from '../i18n/localeStore'
import { useT } from '../i18n/t'

/** Compact HUD control: current locale code, dropdown of all languages. */
export function LanguageSwitcher() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const current = LOCALE_META[locale]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="language-switcher" ref={rootRef}>
      <button
        type="button"
        className="hud-icon-button language-switcher-button"
        title={t('language.label')}
        aria-label={t('language.choose')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="language-switcher-code">{current.code}</span>
      </button>
      {open && (
        <ul
          id={menuId}
          className="language-menu"
          role="listbox"
          aria-label={t('language.choose')}
        >
          {LOCALES.map((id) => {
            const meta = LOCALE_META[id]
            const selected = id === locale
            return (
              <li key={id} role="presentation">
                <button
                  type="button"
                  role="option"
                  className={`language-menu-option${selected ? ' is-selected' : ''}`}
                  aria-selected={selected}
                  onClick={() => {
                    setLocale(id)
                    setOpen(false)
                  }}
                >
                  <span className="language-menu-code">{meta.code}</span>
                  <span className="language-menu-name">{meta.nativeName}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
