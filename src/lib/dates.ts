// PATH: src/lib/dates.ts
//
// Shared date-formatting utilities — import from here instead of calling
// toLocaleDateString directly in components. Consolidates what used to be
// ~35 near-identical local implementations across the app.

// A date-only string ("2026-08-31", a transaction or due date) is a calendar
// day, not an instant. new Date("2026-08-31") reads it as midnight UTC, which
// in the Americas is still Aug 30 -- every date shown a day early. Read it as
// the local calendar day instead; timestamps keep their instant.
export function toDate(iso: string | Date): Date {
  if (iso instanceof Date) return iso
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = toDate(iso)
  return d.toLocaleDateString()
}

export function formatDateShort(
  iso: string | Date | null | undefined,
  opts?: { withYear?: boolean }
): string {
  if (!iso) return '—'
  const d = toDate(iso)
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
