import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'straw-mobile-designer/theme'
const THEME_STORAGE_VERSION = 1

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

/** Apply theme to the document so CSS variables and color-scheme update immediately. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return 'dark'
    const parsed = JSON.parse(raw) as { state?: { theme?: unknown } }
    if (isTheme(parsed?.state?.theme)) return parsed.state.theme
  } catch {
    // Ignore corrupt storage and fall back to dark.
  }
  return 'dark'
}

const initialTheme = readStoredTheme()
applyTheme(initialTheme)

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: initialTheme,
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      toggleTheme: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        set({ theme: next })
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      version: THEME_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    },
  ),
)
