// PATH: src/pages/AccountSetup.tsx
//
// The one screen between signup and a working account -- the QuickBooks/Xero
// style "tell us about your business" step. Three answers, one click:
//
//   1. Who do you keep the books for? (own business / bookkeeper / CPA firm)
//   2. Business or firm name
//   3. Industry (own business only) -> picks the chart-of-accounts template
//
// complete_account_setup() does the rest server-side in one transaction:
// sets the workspace type, creates the chart of accounts (with Schedule C
// lines already mapped), and starts the right plan's trial. Shown by App.tsx
// whenever profiles.setup_completed_at is null -- i.e. once, right after an
// email or Google signup. Invitees never see it (handle_new_user marks them
// done), and every account that existed before this screen was backfilled.

import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth.store'
import { useOrgStore } from '../store/org.store'
import { useLocale } from '../hooks/useLocale'
import { db } from '../lib/supabase'
import { toSafeMessage } from '../lib/errors'
import { recordSignupConsents } from '../services/consent.service'
import LogoBrand from '../components/ui/LogoBrand'
import { IconUser, IconBriefcase, IconCalculator, IconTile } from '../components/ui/AccountTypeIcons'
import type { AppLocale } from '../i18n'

type SetupType = 'self_employed' | 'bookkeeper' | 'accountant'

const INDUSTRIES = [
  'general', 'professional', 'retail', 'restaurant', 'construction', 'healthcare', 'real_estate'
] as const

const SETUP_TYPES: SetupType[] = ['self_employed', 'bookkeeper', 'accountant']

// Same colors the signup screens always used for these three paths.
const TYPE_STYLE: Record<SetupType, { key: string; color: string; Icon: () => JSX.Element }> = {
  self_employed: { key: 'whoSelf',       color: 'var(--lp-accent)', Icon: IconUser },
  bookkeeper:    { key: 'whoBookkeeper', color: 'var(--lp-violet)', Icon: IconBriefcase },
  accountant:    { key: 'whoAccountant', color: 'var(--sem-green)', Icon: IconCalculator },
}

// The four semaphore states every transaction lands in -- the product's
// signature, echoed as the mark on this first screen.
const SEMAPHORE = ['var(--sem-blue)', 'var(--sem-green)', 'var(--sem-amber)', 'var(--sem-red)']

export default function AccountSetup() {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const user           = useAuthStore(s => s.user)
  const refreshProfile = useAuthStore(s => s.refreshProfile)
  const signOut        = useAuthStore(s => s.signOut)
  const loadOrgs       = useOrgStore(s => s.loadOrgs)

  // /signup?type=... from the Pricing page travels as signup metadata;
  // otherwise the most common case is pre-selected.
  const metaType = user?.user_metadata?.account_type as string | undefined
  const [accountType, setAccountType] = useState<SetupType>(
    SETUP_TYPES.includes(metaType as SetupType) ? (metaType as SetupType) : 'self_employed'
  )
  const [name,     setName]     = useState('')
  const [industry, setIndustry] = useState<(typeof INDUSTRIES)[number]>('general')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const isFirm    = accountType !== 'self_employed'
  const canSubmit = name.trim().length >= 2 && !saving

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit || !user) return
    setSaving(true)
    setError(null)

    const { error: rpcErr } = await db.rpc('complete_account_setup', {
      p_account_type:  accountType,
      p_business_name: name.trim(),
      p_industry:      isFirm ? 'general' : industry
    })
    if (rpcErr) {
      setError(toSafeMessage(rpcErr, t('setup.errorGeneric')))
      setSaving(false)
      return
    }

    // Continuing past the terms line below is the acceptance; record it.
    recordSignupConsents(user.id).catch(() => { /* best-effort, never blocks */ })

    // New workspace flags + setup_completed_at -> App.tsx swaps to the app.
    await Promise.all([refreshProfile(), loadOrgs(user.id)])
  }

  const link = { color: 'var(--lp-accent)', textDecoration: 'none', fontWeight: 500 } as const

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--lp-bg)', padding: '24px 16px'
    }}>
      <div style={{ width: 460, maxWidth: '100%' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <LogoBrand variant="full" />
          <div style={{ display: 'flex', gap: 4 }}>
            {(['en', 'es'] as AppLocale[]).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => { void setLocale(l) }}
                className="lp-btn lp-btn-ghost"
                style={{
                  padding: '4px 10px', fontSize: 12,
                  fontWeight: locale === l ? 600 : 400,
                  color: locale === l ? 'var(--lp-text)' : 'var(--lp-text-muted)'
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
            borderRadius: 14, padding: '26px 24px',
            display: 'flex', flexDirection: 'column', gap: 18
          }}
        >
          <div>
            <div aria-hidden style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
              {SEMAPHORE.map(c => (
                <span key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
              ))}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--lp-text)' }}>
              {t('setup.title')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 4 }}>
              {t('setup.subtitle')}
            </div>
          </div>

          {error && (
            <div role="alert" style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)',
              fontSize: 12.5, color: 'var(--sem-red)'
            }}>
              {error}
            </div>
          )}

          {/* 1 — Who */}
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 12.5, color: 'var(--lp-text)', fontWeight: 500, marginBottom: 8 }}>
              {t('setup.whoLabel')}
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SETUP_TYPES.map(type => {
                const { key, color, Icon } = TYPE_STYLE[type]
                const selected = accountType === type
                return (
                  <label
                    key={type}
                    style={{
                      position: 'relative',
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 13px', borderRadius: 11, cursor: 'pointer',
                      border: selected ? `1px solid ${color}` : '0.5px solid var(--lp-border)',
                      background: selected ? `color-mix(in srgb, ${color} 7%, transparent)` : 'transparent',
                      transition: 'border-color 0.15s, background 0.15s'
                    }}
                  >
                    {/* Visually the whole card is the control; the radio stays for keyboard + screen readers. */}
                    <input
                      type="radio"
                      name="account-type"
                      value={type}
                      checked={selected}
                      onChange={() => setAccountType(type)}
                      style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                    />
                    <IconTile color={color}><Icon /></IconTile>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)' }}>
                        {t(`setup.${key}`)}
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                        {t(`setup.${key}Hint`)}
                      </span>
                    </span>
                    <span aria-hidden style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border: selected ? `5px solid ${color}` : '1.5px solid var(--lp-border)'
                    }} />
                  </label>
                )
              })}
            </div>
          </fieldset>

          {/* 2 — Name */}
          <div>
            <label htmlFor="setup-name" style={{ fontSize: 12.5, color: 'var(--lp-text)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
              {isFirm ? t('setup.nameLabelFirm') : t('setup.nameLabelSelf')}
            </label>
            <input
              id="setup-name"
              type="text"
              className="lp-input"
              placeholder={isFirm ? t('setup.namePlaceholderFirm') : t('setup.namePlaceholderSelf')}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={120}
              autoFocus
              required
            />
          </div>

          {/* 3 — Industry (own business only: firms get a template per client) */}
          {!isFirm && (
            <div>
              <label htmlFor="setup-industry" style={{ fontSize: 12.5, color: 'var(--lp-text)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                {t('setup.industryLabel')}
              </label>
              <select
                id="setup-industry"
                className="lp-input"
                value={industry}
                onChange={e => setIndustry(e.target.value as (typeof INDUSTRIES)[number])}
              >
                {INDUSTRIES.map(i => (
                  <option key={i} value={i}>{t(`setup.industries.${i}`)}</option>
                ))}
              </select>
              <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 5, lineHeight: 1.5 }}>
                {t('setup.industryHint')}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--sem-green)', fontWeight: 500 }}>
            {t('setup.trialBadge')}
          </div>

          <button
            type="submit"
            className="lp-btn lp-btn-primary"
            disabled={!canSubmit}
            style={{ justifyContent: 'center', padding: '11px 0', fontSize: 14 }}
          >
            {saving ? t('setup.submitting') : t('setup.submit')}
          </button>

          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', textAlign: 'center', lineHeight: 1.55 }}>
            {t('setup.termsPrefix')}{' '}
            <a href="/legal/terms" target="_blank" rel="noopener noreferrer" style={link}>{t('setup.terms')}</a>
            {' '}{t('setup.and')}{' '}
            <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={link}>{t('setup.privacy')}</a>.
          </div>
        </form>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            type="button"
            onClick={() => { void signOut() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 12.5 }}
          >
            {t('setup.signOut')}
          </button>
        </div>
      </div>
    </div>
  )
}
