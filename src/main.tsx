import React from 'react'
import ReactDOM from 'react-dom/client'

// 🚨 CRITICAL: Global styles + utility classes (.lp-*, .est-*, .lp-web-*)
// Without this import, all className="lp-btn lp-card lp-input ..." are no-ops.
// Bug history: this was missing since the Desktop→Web migration.
import './styles/globals.css'

// CQRS: register all command handlers before any component mounts
import './lib/commands'

// Installs window.onerror / unhandledrejection listeners as a side effect —
// must run before anything else can throw.
import './lib/errorMonitor'

import App from './App'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 🆕 P1 Dark Mode: apply theme BEFORE React renders to prevent FOUC (flash of
// unstyled content). Read directly from localStorage — zustand will rehydrate
// the same value into the store after mount.
try {
  const persisted = localStorage.getItem('lp-theme-mode')
  if (persisted) {
    const parsed = JSON.parse(persisted)
    if (parsed?.state?.mode === 'dark') {
      document.documentElement.classList.add('theme-dark')
    }
  }
} catch {
  // localStorage unavailable / parse error — silently fall back to light
}

// 🔥 crear instancia UNA sola vez
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)