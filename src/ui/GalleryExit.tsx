import { Link } from 'react-router-dom'
import { flushGalleryPersist } from '../gallery/autoPersist'
import { useT } from '../i18n/t'
import { useStrawMobileStore } from '../state/store'
import { useThemeStore } from '../state/themeStore'
import { LanguageSwitcher } from './LanguageSwitcher'
import { FanIcon, GridIcon, MagnetIcon, MoonIcon, RigidLoopIcon, SunIcon } from './icons'

/** Top-right controls: wind, rigid-loop, scanner, theme, language, gallery exit. */
export function GalleryExit() {
  const t = useT()
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const themeLabel = theme === 'dark' ? t('hud.themeLight') : t('hud.themeDark')

  const scannerEnabled = useStrawMobileStore((s) => s.overlapScannerEnabled)
  const toggleOverlapScanner = useStrawMobileStore((s) => s.toggleOverlapScanner)
  const scannerLabel = scannerEnabled ? t('hud.scannerOff') : t('hud.scannerOn')

  const rigidLoopsEnabled = useStrawMobileStore((s) => s.rigidLoopsEnabled)
  const toggleRigidLoops = useStrawMobileStore((s) => s.toggleRigidLoops)
  const rigidLoopsLabel = rigidLoopsEnabled ? t('hud.rigidFloppy') : t('hud.rigidFuse')

  const windEnabled = useStrawMobileStore((s) => s.windEnabled)
  const toggleWind = useStrawMobileStore((s) => s.toggleWind)
  const windLabel = windEnabled ? t('hud.windOff') : t('hud.windOn')

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
      <LanguageSwitcher />
      <Link
        to="/gallery"
        className="hud-icon-button hud-exit-link"
        title={t('hud.openGallery')}
        aria-label={t('hud.openGallery')}
        onClick={() => {
          flushGalleryPersist()
        }}
      >
        <GridIcon className="hud-icon" />
      </Link>
    </div>
  )
}
