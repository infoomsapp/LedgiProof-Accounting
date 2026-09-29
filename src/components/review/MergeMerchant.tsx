// PATH: src/components/review/MergeMerchant.tsx
//
// "Same merchant as…" under a For review row the Brain doesn't know yet.
// merchant_identity (brain_f1) joins spellings on its own only when ONE
// confirmed merchant is clearly the closest; when it can't tell, the person
// can -- merge_merchants() (brain_f2_merge_merchants.sql) remembers it for
// this workspace, and the row is suggested like that merchant from then on.

import { useTranslation } from 'react-i18next'
import { mergeMerchants } from '../../services/review.service'

interface Props {
  orgId:       string
  clientId:    string | null
  merchantKey: string
  known:       string[]
  onMerged:    () => void
  onError:     (message: string) => void
}

export default function MergeMerchant({ orgId, clientId, merchantKey, known, onMerged, onError }: Props) {
  const { t } = useTranslation()
  const options = known.filter(k => k !== merchantKey)
  if (!merchantKey || options.length === 0) return null

  return (
    <select
      aria-label={t('review.merge.label', { merchant: merchantKey })}
      value=""
      onChange={e => {
        const to = e.target.value
        if (!to) return
        mergeMerchants(orgId, clientId, merchantKey, to).then(onMerged, err => onError(err instanceof Error ? err.message : String(err)))
      }}
      style={{
        marginTop: 4, fontSize: 11, padding: '2px 6px', maxWidth: 220,
        background: 'transparent', color: 'var(--lp-text-muted)',
        border: '0.5px dashed var(--lp-border)', borderRadius: 6, fontFamily: 'inherit'
      }}
    >
      <option value="">{t('review.merge.placeholder')}</option>
      {options.map(k => <option key={k} value={k}>{k}</option>)}
    </select>
  )
}
