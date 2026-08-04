import { Link } from 'react-router-dom'
import { flushGalleryPersist } from '../gallery/autoPersist'
import { useStrawMobileStore } from '../state/store'
import { useThemeStore } from '../state/themeStore'
import { GridIcon, MagnetIcon, MoonIcon, SunIcon } from './icons'

/** Top-right controls: scanner toggle, theme toggle, and gallery exit. */
export function GalleryExit() {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const themeLabel = nextTheme === 'light' ? 'Switch to light mode' : 'Switch to dark mode'

  const scannerEnabled = useStrawMobileStore((s) => s.overlapScannerEnabled)
  const toggleOverlapScanner = useStrawMobileStore((s) => s.toggleOverlapScanner)
  const scannerLabel = scannerEnabled
    ? 'Disable connection scanner'
    : 'Enable connection scanner'

  return (
    <div className="hud-cluster hud-top-right">
      <button
        type="button"
        className={`hud-icon-button hud-magnet${scannerEnabled ? ' is-active' : ''}`}
        title={scannerLabel}
        aria-label={scannerLabel}
        aria-pressed={scannerEnabled}
        onClick={toggleOverlapScanner}
      >
        <MagnetIcon className="hud-icon" />
      </button>
      <button
        type="button"
        className="hud-icon-button"
        title={themeLabel}
        aria-label={themeLabel}
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
