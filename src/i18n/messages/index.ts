import type { Locale } from '../locales'
import { be } from './be'
import { da } from './da'
import { en, type Messages } from './en'
import { fi } from './fi'
import { is } from './is'
import { nb } from './nb'
import { pl } from './pl'
import { ru } from './ru'
import { sv } from './sv'
import { uk } from './uk'

export const catalogs: Record<Locale, Messages> = {
  en: en as Messages,
  ru,
  be,
  uk,
  pl,
  da,
  nb,
  sv,
  fi,
  is,
}
