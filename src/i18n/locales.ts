/** Compact codes shown in the language switcher. */
export const LOCALES = ['en', 'ru', 'be', 'uk', 'pl', 'da', 'nb', 'sv', 'fi', 'is'] as const

export type Locale = (typeof LOCALES)[number]

export interface LocaleMeta {
  /** BCP-47 tag for `html lang` and `Intl`. */
  htmlLang: string
  /** Two-letter label in the HUD button (BY/UA match the requested names). */
  code: string
  nativeName: string
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { htmlLang: 'en', code: 'EN', nativeName: 'English' },
  ru: { htmlLang: 'ru', code: 'RU', nativeName: 'Русский' },
  be: { htmlLang: 'be', code: 'BY', nativeName: 'Беларуская' },
  uk: { htmlLang: 'uk', code: 'UA', nativeName: 'Українська' },
  pl: { htmlLang: 'pl', code: 'PL', nativeName: 'Polski' },
  da: { htmlLang: 'da', code: 'DA', nativeName: 'Dansk' },
  nb: { htmlLang: 'nb', code: 'NO', nativeName: 'Norsk' },
  sv: { htmlLang: 'sv', code: 'SV', nativeName: 'Svenska' },
  fi: { htmlLang: 'fi', code: 'FI', nativeName: 'Suomi' },
  is: { htmlLang: 'is', code: 'IS', nativeName: 'Íslenska' },
}

/** Brand name stays in Belarusian in every locale. */
export const BRAND_NAME = 'Павучы клуб'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Map a browser language tag (e.g. `uk-UA`, `nb-NO`) onto a supported locale. */
export function localeFromNavigator(language: string | undefined): Locale | null {
  if (!language) return null
  const lower = language.toLowerCase()
  const primary = lower.split('-')[0] ?? lower
  if (primary === 'nn' || primary === 'no') return 'nb'
  if (isLocale(primary)) return primary
  return null
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const candidates = navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : []
  for (const candidate of candidates) {
    const match = localeFromNavigator(candidate)
    if (match) return match
  }
  return 'en'
}
