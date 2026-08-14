import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  detectBrowserLocale,
  isLocale,
  LOCALE_META,
  type Locale,
} from './locales'

export const LOCALE_STORAGE_KEY = 'straw-mobile-designer/locale'
const LOCALE_STORAGE_VERSION = 1

/** Apply locale to the document so `lang` is correct for a11y and `Intl`. */
export function applyLocale(locale: Locale): void {
  document.documentElement.lang = LOCALE_META[locale].htmlLang
}

function readStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { locale?: unknown } }
    if (isLocale(parsed?.state?.locale)) return parsed.state.locale
  } catch {
    // Ignore corrupt storage and fall through to browser detection.
  }
  return null
}

const initialLocale = readStoredLocale() ?? detectBrowserLocale()
applyLocale(initialLocale)

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: initialLocale,
      setLocale: (locale) => {
        applyLocale(locale)
        set({ locale })
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      version: LOCALE_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ locale: state.locale }),
      onRehydrateStorage: () => (state) => {
        if (state) applyLocale(state.locale)
      },
    },
  ),
)
