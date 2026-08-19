// PATH: src/store/theme.store.ts
//
// Theme preference store — light vs dark.
//
// The CSS tokens already exist in globals.css:
//   :root          → light theme (default, 66 lines of design tokens)
//   .theme-dark    → dark theme overrides (slate-900 surfaces, brighter text)
//
// This store simply toggles the .theme-dark class on document.documentElement
// and persists the user's choice in localStorage.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark'

interface ThemeState {
  mode:        ThemeMode
  setMode:     (mode: ThemeMode) => void
  toggle:      () => void
  /** Applies the current mode to document.documentElement (.theme-dark class). */
  applyToDOM: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'light',  // Default: light theme matches new globals.css :root

      setMode: (mode) => {
        set({ mode })
        get().applyToDOM()
      },

      toggle: () => {
        const next: ThemeMode = get().mode === 'light' ? 'dark' : 'light'
        set({ mode: next })
        get().applyToDOM()
      },

      applyToDOM: () => {
        if (typeof document === 'undefined') return
        const root = document.documentElement
        if (get().mode === 'dark') {
          root.classList.add('theme-dark')
        } else {
          root.classList.remove('theme-dark')
        }
      }
    }),
    {
      name: 'lp-theme-mode',
      onRehydrateStorage: () => (state) => {
        // After zustand rehydrates from localStorage, apply the saved mode
        // to the DOM so the UI doesn't flash light→dark on page load.
        state?.applyToDOM()
      }
    }
  )
)