// PATH: src/lib/errorMonitor.ts
//
// Frontend crash reporting. Forwards uncaught exceptions, unhandled promise
// rejections, and React render errors (via ErrorBoundary) to CGC Core
// through the `report-error` edge function, so both apps' errors land in
// one place instead of only ever surfacing in a user's console.
//
// Importing this module installs the global window listeners as a side
// effect (see bottom of file) — import it once from main.tsx. ErrorBoundary
// also calls reportError() directly, since render-phase errors never reach
// window.onerror/unhandledrejection.
//
// Must never throw and must never be the reason something breaks worse —
// every path here is wrapped and fails silently.

import { supabase } from './supabase'

const APP_SOURCE = 'ledgiproof'
const DEDUPE_WINDOW_MS = 60_000

type Severity = 'info' | 'warning' | 'error' | 'critical'

interface ReportContext {
  section?:  string
  severity?: Severity
  extra?:    Record<string, unknown>
}

const recentlySent = new Map<string, number>()

function fingerprint(message: string, stack: string): string {
  const topFrame = stack.split('\n').find(l => l.trim().length > 0) ?? ''
  return `${message.slice(0, 200)}::${topFrame.trim().slice(0, 200)}`
}

export function reportError(error: unknown, context: ReportContext = {}): void {
  try {
    const message = error instanceof Error ? error.message : String(error)
    const stack   = error instanceof Error ? (error.stack ?? '') : ''

    const key = fingerprint(message, stack)
    const now = Date.now()
    const last = recentlySent.get(key)
    if (last && now - last < DEDUPE_WINDOW_MS) return
    recentlySent.set(key, now)

    void supabase.functions.invoke('report-error', {
      body: {
        app_source:  APP_SOURCE,
        environment: import.meta.env.MODE,
        severity:    context.severity ?? 'error',
        message:     message.slice(0, 2000),
        stack:       stack.slice(0, 4000),
        url:         typeof window !== 'undefined' ? window.location.href : undefined,
        user_agent:  typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        context:     { section: context.section, ...context.extra }
      }
    }).catch(() => { /* monitoring must never surface its own failures */ })
  } catch {
    // never let error reporting itself throw
  }
}

function installGlobalHandlers(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __lpErrorMonitorInstalled?: boolean }
  if (w.__lpErrorMonitorInstalled) return // HMR-safe: install once per page load
  w.__lpErrorMonitorInstalled = true

  window.addEventListener('error', event => {
    reportError(event.error ?? event.message, { section: 'window.onerror' })
  })

  window.addEventListener('unhandledrejection', event => {
    reportError(event.reason, { section: 'unhandledrejection' })
  })
}

installGlobalHandlers()
