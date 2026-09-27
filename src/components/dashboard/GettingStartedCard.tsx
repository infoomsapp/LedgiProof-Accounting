// PATH: src/components/dashboard/GettingStartedCard.tsx
//
// "Get started" checklist at the top of a new account's dashboard -- the
// QuickBooks/Xero setup guide, in LedgiProof's semaphore language: a step
// you've done turns blue (verified, ready -- the same blue a transaction earns),
// the next one to do is amber (needs your eyes), the rest wait.
//
// Every step is detected from real data (nothing to tick by hand), so it
// completes itself as the user works. Disappears once everything is done,
// or for good when dismissed (profiles.onboarding_hints_seen.getting_started).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { db } from '../../lib/supabase'
import { useOrgStore } from '../../store/org.store'
import { useOnboardingHints } from '../../hooks/useOnboardingHints'

type Kind = 'self' | 'firm'

interface Step {
  key:  string
  to:   string
  done: boolean
}

async function hasRows(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<boolean> {
  const { count, error } = await query
  return !error && (count ?? 0) > 0
}

export default function GettingStartedCard({ kind }: { kind: Kind }) {
  const { t }     = useTranslation()
  const navigate  = useNavigate()
  const activeOrg = useOrgStore(s => s.activeOrg)
  const hints     = useOnboardingHints('getting_started')
  const [steps, setSteps] = useState<Step[] | null>(null)

  const orgId   = activeOrg?.id
  const hasLogo = !!activeOrg?.logo_url

  useEffect(() => {
    if (!orgId || !hints.shouldShow) return
    let cancelled = false
    const head = { count: 'exact' as const, head: true }

    const load = kind === 'self'
      ? Promise.all([
          hasRows(db.from('transactions').select('id', head).eq('org_id', orgId)),
          hasRows(db.from('invoices').select('id', head).eq('org_id', orgId)),
          hasRows(db.from('transactions').select('id', head).eq('org_id', orgId).not('approved_at', 'is', null)),
        ]).then(([bank, invoice, categorized]): Step[] => [
          { key: 'bank',       to: '/import/bank-transactions', done: bank },
          { key: 'categorize', to: '/review',                   done: categorized },
          { key: 'invoice',    to: '/invoices',                 done: invoice },
          { key: 'branding',   to: '/settings?tab=branding',    done: hasLogo },
        ])
      : Promise.all([
          hasRows(db.from('clients').select('id', head).eq('org_id', orgId)),
          hasRows(db.from('client_portal_invitations').select('id', head).eq('org_id', orgId)),
          hasRows(db.from('invitations').select('id', head).eq('org_id', orgId)),
        ]).then(([client, portal, team]): Step[] => [
          { key: 'client',   to: '/clients',               done: client },
          { key: 'portal',   to: '/clients',               done: portal },
          { key: 'team',     to: '/team',                  done: team },
          { key: 'branding', to: '/settings?tab=branding', done: hasLogo },
        ])

    load.then(s => { if (!cancelled) setSteps(s) }).catch(() => { /* card is optional */ })
    return () => { cancelled = true }
  }, [orgId, kind, hasLogo, hints.shouldShow])

  if (!hints.shouldShow || !steps) return null
  const doneCount = steps.filter(s => s.done).length
  if (doneCount === steps.length) return null
  const nextKey = steps.find(s => !s.done)?.key

  return (
    <section
      aria-label={t('gettingStarted.title')}
      style={{
        background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
        borderRadius: 14, padding: '16px 18px', marginBottom: 20
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--lp-text)' }}>
            {t('gettingStarted.title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 2 }}>
            {t('gettingStarted.progress', { done: doneCount, total: steps.length })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { void hints.dismissAll() }}
          disabled={hints.dismissing}
          className="lp-btn lp-btn-ghost"
          style={{ fontSize: 12, padding: '4px 10px' }}
        >
          {t('gettingStarted.dismiss')}
        </button>
      </div>

      {/* Progress in semaphore colors: blue = done/verified, amber = up next. */}
      <div aria-hidden style={{ display: 'flex', gap: 4, margin: '12px 0 10px' }}>
        {steps.map(s => (
          <span key={s.key} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: s.done ? 'var(--sem-blue)'
                      : s.key === nextKey ? 'var(--sem-amber)'
                      : 'var(--lp-border)'
          }} />
        ))}
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {steps.map(s => {
          const isNext = s.key === nextKey
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => navigate(s.to)}
                disabled={s.done}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 10px', borderRadius: 10, textAlign: 'left',
                  border: isNext ? '0.5px solid var(--sem-amber-border)' : '0.5px solid transparent',
                  background: isNext ? 'var(--sem-amber-bg)' : 'transparent',
                  cursor: s.done ? 'default' : 'pointer', fontFamily: 'inherit'
                }}
              >
                <span aria-hidden style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: s.done ? 'var(--sem-blue)' : 'transparent',
                  border: s.done ? 'none'
                        : `1.5px solid ${isNext ? 'var(--sem-amber)' : 'var(--lp-border)'}`,
                  color: '#fff', fontSize: 12
                }}>
                  {s.done ? '✓' : ''}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{
                    display: 'block', fontSize: 13, fontWeight: isNext ? 600 : 500,
                    color: s.done ? 'var(--lp-text-muted)' : 'var(--lp-text)',
                    textDecoration: s.done ? 'line-through' : 'none'
                  }}>
                    {t(`gettingStarted.${s.key}`)}
                  </span>
                  {!s.done && (
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 1 }}>
                      {t(`gettingStarted.${s.key}Hint`)}
                    </span>
                  )}
                </span>
                {!s.done && (
                  <span aria-hidden style={{ fontSize: 14, color: isNext ? 'var(--sem-amber)' : 'var(--lp-text-muted)' }}>→</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
