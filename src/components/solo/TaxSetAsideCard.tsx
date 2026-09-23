// PATH: src/components/solo/TaxSetAsideCard.tsx
//
// Solo — Apartado de impuestos (tax set-aside). Recomienda apartar un % de la
// ganancia neta y trackea cuánto has apartado, con barra de progreso.
// Ahorro, no tax-prep — no pisa la app de impuestos. (Futuro: "Entrepreneur".)

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useSetAsideSummary, useSetAsideEntries, useAddSetAside, useUpdateSetAsideRate
} from '../../hooks/useSetAside'
import { formatCurrency } from '../../lib/currency'

const fmt = (n: number) => formatCurrency(n, 'USD', { maximumFractionDigits: 0 })

const RATE_OPTIONS = [0.20, 0.25, 0.30, 0.35]

interface Props {
  orgId:        string
  year:         number
  userId:       string | null
  netProfitYTD: number
}

export default function TaxSetAsideCard({ orgId, year, userId, netProfitYTD }: Props) {
  const { t } = useTranslation()
  const summary = useSetAsideSummary(orgId, year)
  const entries = useSetAsideEntries(orgId, year)
  const addMut  = useAddSetAside(orgId, year)
  const rateMut = useUpdateSetAsideRate(orgId)

  const [amount, setAmount] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rate       = summary.data?.rate ?? 0.30
  const setAside   = summary.data?.totalSetAside ?? 0
  const target     = Math.max(0, netProfitYTD) * rate           // recomendado sobre ganancia
  const gap        = Math.max(0, target - setAside)
  const pct        = target > 0 ? Math.min(100, Math.round((setAside / target) * 100)) : 0
  const onTrack    = setAside >= target && target > 0

  async function handleAdd() {
    const amt = parseFloat(amount)
    if (!userId)         { setError(t('solo.notSignedIn')); return }
    if (!amt || amt <= 0) { setError(t('solo.enterAnAmount')); return }
    setError(null)
    try {
      await addMut.mutateAsync({
        orgId, userId, amount: amt, date: new Date().toISOString().slice(0, 10)
      })
      setAmount('')
    } catch (e: any) {
      setError(e?.message ?? t('solo.couldNotSave'))
    }
  }

  return (
    <div style={{
      background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
      borderRadius: 12, overflow: 'hidden', marginBottom: 16
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: '0.5px solid var(--lp-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--lp-text)' }}>{t('solo.taxSetAside')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 3 }}>
            {t('solo.taxSetAsideSub')}
          </div>
        </div>
        {/* Rate selector */}
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: 'var(--lp-surface-2)', borderRadius: 8 }}>
          {RATE_OPTIONS.map(r => (
            <button key={r} type="button"
              onClick={() => rateMut.mutate(r)}
              style={{
                padding: '4px 9px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11.5, fontFamily: 'inherit',
                background: Math.abs(rate - r) < 0.001 ? 'var(--sem-blue-bg-strong)' : 'transparent',
                color: Math.abs(rate - r) < 0.001 ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
                fontWeight: Math.abs(rate - r) < 0.001 ? 600 : 400
              }}>
              {Math.round(r * 100)}%
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 18px' }}>
        {/* Progreso */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
          <span style={{ color: 'var(--lp-text)' }}>
            {t('solo.setAsidePrefix')} <strong>{fmt(setAside)}</strong> {t('solo.setAsideOf', { target: fmt(target) })}
          </span>
          <span style={{ color: onTrack ? 'var(--sem-green)' : 'var(--lp-text-muted)' }}>
            {onTrack ? t('solo.onTrack') : t('solo.toGo', { amount: fmt(gap) })}
          </span>
        </div>
        <div style={{ height: 9, borderRadius: 100, background: 'var(--lp-surface-2)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 100,
            background: onTrack ? 'var(--sem-green)' : 'var(--lp-accent)', transition: 'width 0.25s'
          }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 6 }}>
          {t('solo.recommendedRate', { pct: Math.round(rate * 100), amount: fmt(Math.max(0, netProfitYTD)) })}
        </div>

        {/* Log aporte */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input className="lp-input" inputMode="decimal" placeholder={t('solo.amountPlaceholder')}
                 value={amount} onChange={e => setAmount(e.target.value)} style={{ flex: 1 }} />
          <button className="lp-btn lp-btn-primary" onClick={handleAdd} disabled={addMut.isPending}>
            {addMut.isPending ? '…' : t('solo.logSetAside')}
          </button>
        </div>
        {error && <div style={{ fontSize: 11.5, color: 'var(--sem-red)', marginTop: 6 }}>⚠ {error}</div>}

        {/* Historial */}
        {(entries.data?.length ?? 0) > 0 && (
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={() => setExpanded(e => !e)}
              style={{ background: 'none', border: 'none', color: 'var(--lp-accent)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
              {expanded
                ? t('solo.hideContributions', { count: entries.data!.length })
                : t('solo.showContributions', { count: entries.data!.length })} {expanded ? '▲' : '▼'}
            </button>
            {expanded && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {entries.data!.map(e => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                    <span style={{ color: 'var(--lp-text-muted)' }}>{e.entry_date}{e.note ? ` · ${e.note}` : ''}</span>
                    <span style={{ color: 'var(--sem-green)', fontFamily: 'monospace' }}>{fmt(Number(e.amount))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
