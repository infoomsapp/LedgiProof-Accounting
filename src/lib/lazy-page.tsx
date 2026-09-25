// PATH: src/lib/lazy-page.tsx
//
// Route-level code splitting. Every page used to be statically imported by
// App.tsx, so the browser downloaded the whole app (~1.9 MB / 526 kB gzip)
// before painting anything — even the login screen. `lazyPage()` turns a
// page into its own on-demand chunk while keeping the call sites unchanged:
//
//   const Transactions = lazyPage(() => import('./pages/Transactions'))
//   ...
//   <Route path="transactions" element={<Transactions />} />
//
// Each lazy page carries its own <Suspense> boundary, so when a page chunk is
// loading only the page area shows the fallback — the surrounding shell
// (sidebar, header) stays on screen, no full-screen flash.
//
// Three small pieces of "zero friction" behavior live here on purpose:
//  1. The fallback is DELAYED (150 ms). A chunk that's already cached (every
//     visit after the first, or after a preload) resolves before the delay
//     ends, so the user never sees a spinner flash at all.
//  2. `LazyPage.preload()` lets the app warm the chunks of pages a user is
//     likely to open next while the browser is idle.
//  3. Stale-chunk recovery: after a deploy, a tab that was already open still
//     points at the old chunk file names, which no longer exist. The first
//     time that happens we reload the page once (guarded by sessionStorage
//     so a genuinely broken chunk can't cause a reload loop); a second
//     failure falls through to the surrounding ErrorBoundary as usual.

import { lazy, Suspense, useEffect, useState, type ComponentProps, type ComponentType } from 'react'
import SemaphoreSpinner from '../components/ui/SemaphoreSpinner'
import i18n from '../i18n'

const RELOAD_FLAG = 'lp-chunk-reload'
const FALLBACK_DELAY_MS = 150

function loadWithStaleChunkRecovery<M>(loader: () => Promise<M>): Promise<M> {
  return loader().then(
    mod => {
      try { sessionStorage.removeItem(RELOAD_FLAG) } catch { /* storage unavailable */ }
      return mod
    },
    err => {
      let alreadyReloaded = false
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'
        if (!alreadyReloaded) sessionStorage.setItem(RELOAD_FLAG, '1')
      } catch { /* storage unavailable — can't guard, so don't reload */ alreadyReloaded = true }

      // Offline: a reload would only land on the browser's offline page.
      if (!alreadyReloaded && navigator.onLine) {
        window.location.reload()
        return new Promise<M>(() => { /* page is reloading */ })
      }
      throw err
    }
  )
}

function DelayedFallback() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), FALLBACK_DELAY_MS)
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: 1, minHeight: 240, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12
      }}
    >
      <SemaphoreSpinner size="md" inline />
      <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>{i18n.t('common.loading')}</div>
    </div>
  )
}

export function lazyPage<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>
) {
  const Lazy = lazy(() => loadWithStaleChunkRecovery(loader))

  function LazyPage(props: ComponentProps<T>) {
    return (
      <Suspense fallback={<DelayedFallback />}>
        <Lazy {...(props as any)} />
      </Suspense>
    )
  }

  // Warm the chunk without rendering. Errors are swallowed on purpose: a
  // failed preload must never surface — the real navigation will retry (and
  // recover) through the normal path.
  LazyPage.preload = () => { void loader().catch(() => {}) }

  return LazyPage
}
