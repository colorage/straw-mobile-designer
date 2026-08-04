import { Link } from 'react-router-dom'
import { flushGalleryPersist } from '../gallery/autoPersist'
import { useThemeStore } from '../state/themeStore'
import { GridIcon, MoonIcon, SunIcon } from './icons'

/** Top-right controls: theme toggle (left) and gallery exit (right). */
export function GalleryExit() {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const label = nextTheme === 'light' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <div className="hud-cluster hud-top-right">
      <button
        type="button"
        className="hud-icon-button"
        title={label}
        aria-label={label}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <SunIcon className="hud-icon" /> : <MoonIcon className="hud-icon" />}
      </button>
      <Link
        to="/gallery"
        className="hud-icon-button hud-exit-link"
        title="Open gallery"
        aria-label="Open gallery"
        onClick={() => {
          flushGalleryPersist()
        }}
      >
        <GridIcon className="hud-icon" />
      </Link>
    </div>
  )
}
