// PATH: src/components/dashboard/v2/shared/SourceTag.tsx
//
// Tiny "data source" chip. Used to disambiguate cards that look similar but
// draw from different sources — e.g. "Bank feed" (verified transactions) vs
// "General ledger" (posted journal entries), so Income/Expenses in the
// overview never reads as the same thing as the firm P&L.

interface Props {
  label:  string
  title?: string
}

export default function SourceTag({ label, title }: Props) {
  return (
    <span
      title={title}
      style={{
        fontSize: 9, fontWeight: 700, color: 'var(--lp-text-muted)',
        background: 'var(--lp-surface-2)', border: '1px solid var(--lp-border)',
        borderRadius: 100, padding: '2px 8px',
        textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
        cursor: title ? 'help' : 'default'
      }}
    >
      {label}
    </span>
  )
}
