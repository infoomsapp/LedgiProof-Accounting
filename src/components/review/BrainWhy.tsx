// PATH: src/components/review/BrainWhy.tsx
//
// "Why?" under a For review suggestion: the evidence the Brain's one engine
// (lp_private.suggest_account, brain_f2_evidence.sql) returned for it --
// each signal that backs the account, their agreement, and any close
// alternative. Deterministic points, no AI: this is the whole reasoning.

import { useTranslation } from 'react-i18next'
import type { BrainEvidence } from '../../services/review.service'

export default function BrainWhy({ evidence }: { evidence: BrainEvidence[] | null | undefined }) {
  const { t } = useTranslation()
  if (!evidence || evidence.length === 0) return null

  return (
    <details style={{ marginTop: 2 }}>
      <summary style={{ cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 11, userSelect: 'none' }}>
        {t('review.why.button')}
      </summary>
      <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11, lineHeight: 1.5 }}>
        {evidence.map((e, i) => (
          <li key={i} style={{ color: e.signal === 'conflict' ? 'var(--sem-amber)' : 'var(--lp-text-muted)' }}>
            {t(`review.why.${e.signal}`, {
              account:  e.account_name ?? '',
              merchant: e.merchant ?? '',
              count:    e.count ?? 0,
              category: e.category ?? '',
            })}
            {e.signal !== 'conflict' && e.signal !== 'rule' && (
              <span style={{ opacity: 0.7 }}> · {t('review.why.points', { points: e.points })}</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
