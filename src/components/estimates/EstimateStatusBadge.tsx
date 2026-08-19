// PATH: src/components/estimates/EstimateStatusBadge.tsx
//
// REFACTOR v32 (CSS Sprint): inline styles → .est-badge classes from globals.css.
//
// The status enum maps 1:1 to a CSS class:
//   draft, sent, viewed, accepted, rejected,
//   counter_offered, expired, converted, cancelled
//
// All visual properties (color, bg, border, font) come from CSS variables
// (--est-*). To change palette in the future, edit globals.css only.

import { ESTIMATE_STATUS_CONFIG, type EstimateStatus } from '../../types/estimate'

interface Props {
  status:   EstimateStatus
  /** Compact = smaller padding (for table rows) */
  compact?: boolean
}

export default function EstimateStatusBadge({ status, compact = false }: Props) {
  const cfg = ESTIMATE_STATUS_CONFIG[status]

  return (
    <span className={`est-badge ${status}${compact ? ' compact' : ''}`}>
      <span aria-hidden>{cfg.emoji}</span>
      {cfg.label}
    </span>
  )
}