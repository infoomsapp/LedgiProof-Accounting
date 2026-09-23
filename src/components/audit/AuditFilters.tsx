// PATH: src/components/audit/AuditFilters.tsx
// Filters bar for the auditor's transaction list.
// Collapsible panel with: date range, semaphore status (multi), amount range, free search.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AuditFilters } from '../../services/auditor.service'

interface Props {
  value:   AuditFilters
  onChange: (next: AuditFilters) => void
  onReset:  () => void
  loading?: boolean
}

// `labelKey` holds an i18n KEY — resolved with t() at the render site.
const SEMAPHORES: Array<{
  key: 'blue' | 'green' | 'amber' | 'red'
  labelKey: string
  color: string
  emoji: string
}> = [
  { key: 'blue',  labelKey: 'audit.semVerified',    color: '#3b82f6', emoji: '🔵' },
  { key: 'green', labelKey: 'audit.semReconciled',  color: '#22c55e', emoji: '🟢' },
  { key: 'amber', labelKey: 'audit.semNeedsReview', color: '#f59e0b', emoji: '🟡' },
  { key: 'red',   labelKey: 'audit.semUrgent',      color: '#ef4444', emoji: '🔴' }
]

export default function AuditFilters({ value, onChange, onReset, loading }: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const hasFilters =
    !!value.date_from || !!value.date_to ||
    !!value.client_id ||
    (value.semaphore?.length ?? 0) > 0 ||
    value.min_amount != null || value.max_amount != null ||
    !!value.search

  function toggleSemaphore(key: 'blue' | 'green' | 'amber' | 'red') {
    const current = value.semaphore ?? []
    const next = current.includes(key)
      ? current.filter(s => s !== key)
      : [...current, key]
    const { semaphore: _drop, ...rest } = value
    onChange(next.length > 0 ? { ...rest, semaphore: next } : rest)
  }

  function updateField<K extends keyof AuditFilters>(key: K, val: AuditFilters[K]) {
    onChange({ ...value, [key]: val })
  }

  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: '0.5px solid var(--lp-border)',
      borderRadius: 11,
      marginBottom: 14,
      overflow: 'hidden'
    }}>

      {/* ── Top bar: search + toggle + reset ─────────────────────────────── */}
      <div style={{
        padding: '10px 14px',
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        gap: 8, alignItems: 'center'
      }}>
        <input
          type="search"
          value={value.search ?? ''}
          onChange={e => updateField('search', e.target.value || undefined)}
          placeholder={t('audit.searchPlaceholder')}
          disabled={loading}
          style={{
            padding: '6px 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid var(--lp-border)',
            borderRadius: 7,
            color: 'var(--lp-text)',
            fontSize: 12.5, fontFamily: 'inherit',
            outline: 'none'
          }}
        />

        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            padding: '6px 12px', borderRadius: 7,
            background: expanded ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.03)',
            border: `0.5px solid ${expanded ? 'rgba(34,197,94,0.35)' : 'var(--lp-border)'}`,
            color: expanded ? '#22c55e' : '#cbd5e1',
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 5
          }}
        >
          <span style={{ fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
          {t('audit.filters')}
          {hasFilters && (
            <span style={{
              fontSize: 9, padding: '0 5px', borderRadius: 100,
              background: '#22c55e', color: '#0f172a', fontWeight: 700,
              marginLeft: 2
            }}>
              ●
            </span>
          )}
        </button>

        <button
          onClick={onReset}
          disabled={!hasFilters || loading}
          style={{
            padding: '6px 12px', borderRadius: 7,
            background: 'transparent',
            border: '0.5px solid var(--lp-border)',
            color: hasFilters ? '#cbd5e1' : '#475569',
            fontSize: 12, fontWeight: 500,
            cursor: hasFilters ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', whiteSpace: 'nowrap'
          }}
        >
          {t('audit.reset')}
        </button>
      </div>

      {/* ── Expanded panel ────────────────────────────────────────────────── */}
      {expanded && (
        <div style={{
          padding: '14px',
          borderTop: '0.5px solid var(--lp-border)',
          background: 'rgba(255,255,255,0.02)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14
        }}>

          {/* Date range */}
          <FilterBlock label={t('audit.dateRange')}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="date"
                value={value.date_from ?? ''}
                onChange={e => updateField('date_from', e.target.value || undefined)}
                style={dateInputStyle}
              />
              <span style={{ color: '#475569', alignSelf: 'center', fontSize: 11 }}>→</span>
              <input
                type="date"
                value={value.date_to ?? ''}
                onChange={e => updateField('date_to', e.target.value || undefined)}
                style={dateInputStyle}
              />
            </div>
          </FilterBlock>

          {/* Semaphore status */}
          <FilterBlock label={t('audit.status')}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {SEMAPHORES.map(s => {
                const active = (value.semaphore ?? []).includes(s.key)
                return (
                  <button
                    key={s.key}
                    onClick={() => toggleSemaphore(s.key)}
                    style={{
                      padding: '4px 9px', borderRadius: 100,
                      background: active ? `${s.color}20` : 'rgba(255,255,255,0.03)',
                      border: `0.5px solid ${active ? s.color : 'var(--lp-border)'}`,
                      color: active ? s.color : 'var(--lp-text-muted)',
                      fontSize: 10.5, fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.12s'
                    }}
                  >
                    {s.emoji} {t(s.labelKey)}
                  </button>
                )
              })}
            </div>
          </FilterBlock>

          {/* Amount range */}
          <FilterBlock label={t('audit.amountRange')}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                value={value.min_amount ?? ''}
                onChange={e => updateField('min_amount',
                  e.target.value === '' ? undefined : Number(e.target.value)
                )}
                placeholder={t('audit.min')}
                style={{ ...amountInputStyle, flex: 1 }}
              />
              <span style={{ color: '#475569', fontSize: 11 }}>→</span>
              <input
                type="number"
                value={value.max_amount ?? ''}
                onChange={e => updateField('max_amount',
                  e.target.value === '' ? undefined : Number(e.target.value)
                )}
                placeholder={t('audit.max')}
                style={{ ...amountInputStyle, flex: 1 }}
              />
            </div>
          </FilterBlock>

          {/* Client filter (optional - shown only if client list is available externally) */}
          <FilterBlock label={t('audit.client')}>
            <input
              type="text"
              value={value.client_id ?? ''}
              onChange={e => updateField('client_id', e.target.value || undefined)}
              placeholder={t('audit.clientIdPlaceholder')}
              style={dateInputStyle}
            />
          </FilterBlock>

        </div>
      )}

      {/* ── Active filters chips (always visible when collapsed AND filters exist) ── */}
      {!expanded && hasFilters && (
        <div style={{
          padding: '8px 14px',
          borderTop: '0.5px solid var(--lp-border)',
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center'
        }}>
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 4 }}>
            {t('audit.activeFilters')}
          </span>

          {value.date_from && (
            <Chip text={t('audit.chipFrom', { date: value.date_from })} onRemove={() => updateField('date_from', undefined)} />
          )}
          {value.date_to && (
            <Chip text={t('audit.chipTo', { date: value.date_to })} onRemove={() => updateField('date_to', undefined)} />
          )}
          {(value.semaphore ?? []).map(s => (
            <Chip
              key={s}
              text={t(SEMAPHORES.find(x => x.key === s)?.labelKey ?? s)}
              onRemove={() => toggleSemaphore(s)}
            />
          ))}
          {value.min_amount != null && (
            <Chip text={t('audit.chipMin', { amount: value.min_amount })} onRemove={() => updateField('min_amount', undefined)} />
          )}
          {value.max_amount != null && (
            <Chip text={t('audit.chipMax', { amount: value.max_amount })} onRemove={() => updateField('max_amount', undefined)} />
          )}
          {value.search && (
            <Chip text={`"${value.search}"`} onRemove={() => updateField('search', undefined)} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: '#64748b', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Chip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 4px 2px 8px', borderRadius: 100,
      background: 'rgba(167,139,250,0.10)',
      border: '0.5px solid rgba(167,139,250,0.25)',
      fontSize: 10.5, color: '#a78bfa'
    }}>
      {text}
      <button
        onClick={onRemove}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#a78bfa', fontSize: 11, lineHeight: 1, padding: '0 2px'
        }}
      >
        ×
      </button>
    </span>
  )
}

const dateInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '5px 8px', borderRadius: 6,
  background: 'var(--lp-surface)',
  border: '0.5px solid var(--lp-border)',
  color: 'var(--lp-text)', fontSize: 11.5,
  fontFamily: 'inherit', outline: 'none',
  colorScheme: 'dark'
}

const amountInputStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 6,
  background: 'var(--lp-surface)',
  border: '0.5px solid var(--lp-border)',
  color: 'var(--lp-text)', fontSize: 11.5,
  fontFamily: 'inherit', outline: 'none'
}
