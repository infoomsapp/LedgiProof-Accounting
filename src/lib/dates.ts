// PATH: src/lib/dates.ts
//
// Shared date-formatting utilities — import from here instead of calling
// toLocaleDateString directly in components. Consolidates what used to be
// ~35 near-identical local implementations across the app.

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString()
}

export function formatDateShort(
  iso: string | Date | null | undefined,
  opts?: { withYear?: boolean }
): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(opts?.withYear === false ? {} : { year: 'numeric' })
  })
}

export function formatDateHeadline(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}
