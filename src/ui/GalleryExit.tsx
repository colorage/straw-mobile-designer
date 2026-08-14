import { Link } from 'react-router-dom'
import { flushGalleryPersist } from '../gallery/autoPersist'
import { useStrawMobileStore } from '../state/store'
import { useThemeStore } from '../state/themeStore'
import { useHelpPanelStore } from './helpPanelStore'
import {
  FanIcon,
  GridIcon,
  HelpIcon,
  MagnetIcon,
  MoonIcon,
  RigidLoopIcon,
  SunIcon,
} from './icons'

/** Top-right controls: wind, rigid-loop, scanner, theme, help, gallery exit. */
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

  const rigidLoopsEnabled = useStrawMobileStore((s) => s.rigidLoopsEnabled)
  const toggleRigidLoops = useStrawMobileStore((s) => s.toggleRigidLoops)
  const rigidLoopsLabel = rigidLoopsEnabled
    ? 'Keep closed loops floppy'
    : 'Fuse closed loops into rigid pieces'

  const windEnabled = useStrawMobileStore((s) => s.windEnabled)
  const toggleWind = useStrawMobileStore((s) => s.toggleWind)
  const windLabel = windEnabled
    ? 'Turn wind off'
    : 'Turn wind on — gentle breeze on hanging pieces'

  const helpOpen = useHelpPanelStore((s) => s.open)
  const toggleHelp = useHelpPanelStore((s) => s.toggle)

  return (
    <div className="hud-cluster hud-top-right">
      <button
        type="button"
        className={`hud-icon-button hud-fan${windEnabled ? ' is-active' : ''}`}
        title={windLabel}
        aria-label={windLabel}
        aria-pressed={windEnabled}
        onClick={toggleWind}
      >
        <FanIcon className="hud-icon" />
      </button>
      <button
        type="button"
        className={`hud-icon-button hud-rigid${rigidLoopsEnabled ? ' is-active' : ''}`}
        title={rigidLoopsLabel}
        aria-label={rigidLoopsLabel}
        aria-pressed={rigidLoopsEnabled}
        onClick={toggleRigidLoops}
      >
        <RigidLoopIcon className="hud-icon" />
      </button>
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
      <button
        type="button"
        className={`hud-icon-button${helpOpen ? ' is-active' : ''}`}
        title="Shortcuts (?)"
        aria-label="Open shortcuts help"
        aria-pressed={helpOpen}
        onClick={toggleHelp}
      >
        <HelpIcon className="hud-icon" />
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
