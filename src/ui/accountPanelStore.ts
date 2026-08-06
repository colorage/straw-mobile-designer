import { create } from 'zustand'

export type AccountPanel = 'none' | 'signIn' | 'signUp' | 'profile'

interface AccountPanelState {
  panel: AccountPanel
  open: (panel: Exclude<AccountPanel, 'none'>) => void
  close: () => void
}

/** Shared so the header button and the gallery prompts open the same dialog. */
export const useAccountPanelStore = create<AccountPanelState>()((set) => ({
  panel: 'none',
  open: (panel) => set({ panel }),
  close: () => set({ panel: 'none' }),
}))
