import { useT } from '../i18n/t'
import { CoffeeIcon } from './icons'

const BMC_URL = 'https://buymeacoffee.com/siaroza'

/** Fixed bottom-right link to support the project on Buy Me a Coffee. */
export function BuyMeACoffeeButton() {
  const t = useT()
  return (
    <a
      className="bmc-button hud-icon-button"
      href={BMC_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={t('bmc.title')}
      aria-label={t('bmc.title')}
    >
      <CoffeeIcon className="hud-icon" />
    </a>
  )
}
