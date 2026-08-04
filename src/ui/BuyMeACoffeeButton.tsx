import { CoffeeIcon } from './icons'

const BMC_URL = 'https://buymeacoffee.com/siaroza'

/** Fixed bottom-right link to support the project on Buy Me a Coffee. */
export function BuyMeACoffeeButton() {
  return (
    <a
      className="bmc-button hud-icon-button"
      href={BMC_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Buy me a coffee"
      aria-label="Buy me a coffee"
    >
      <CoffeeIcon className="hud-icon" />
    </a>
  )
}
