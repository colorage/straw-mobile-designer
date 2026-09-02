import { create } from 'zustand'

interface HelpPanelState {
  open: boolean
  show: () => void
  hide: () => void
  toggle: () => void
}

/** Shared so the HUD ? button and the keyboard shortcut open the same panel. */
export const useHelpPanelStore = create<HelpPanelState>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
}))
