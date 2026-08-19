// PATH: src/components/payroll/PayrollEmployerSetupCard.tsx
//
// Employer-level payroll setup: pay frequency, account mapping (Cash /
// Payroll Expense / Payroll Tax Expense — the only 3 accounts
// payroll_set_account_mapping actually validates; there is no "Payroll
// Liabilities" leg in this schema's atomic posting, so this component does
// NOT invent a field for one), and the Check employer onboarding trigger.
//
// Account mapping lets the user PICK from their existing Chart of Accounts.
// New system-template clients get "Payroll Expense" + "Payroll Tax Expense
// (Employer)" automatically now (seeded into all 7 system CoA templates —
// see the seed_payroll_accounts_into_system_templates migration), but
// clients that existed before that migration, or that used a custom
// template, still won't have them. For that case only (firm-managed
// clients, where accounts.service.ts's createAccount accepts a clientId),
// this card offers a one-click "Quick-create" that adds both accounts using
// codes derived from the client's own existing numbering (highest expense
// code + 10/+20) — not hardcoded, since every template uses different
// numbers. Self-service orgs (clientId null) don't get this button because
// createAccount refuses un-scoped accounts by design (Chart of Accounts
// module invariant, not something Payroll should silently override) — they
// still fall back to the /accounts link.

import { useState, useEffect, useCallback } from 'react'
import Button from '../ui/Button'
import {
  usePayrollEmployerSync,
  useCreatePayrollEmployerProfile,
  useSetPayrollAccountMapping,
  useStartPayrollEmployerOnboarding
} from '../../hooks/usePayroll'
import { getAccounts, createAccount } from '../../services/accounts.service'
import type { Account } from '../../types/database.types'
import type { PayrollPayFrequency, SupportedPayrollState } from '../../types/payroll'
import { PAYROLL_SUPPORTED_STATES } from '../../types/payroll'

interface Props {
  orgId:          string
  clientId:       string | null
  canConfigure:   boolean
}

export default function PayrollEmployerSetupCard({ orgId, clientId, canConfigure }: Props) {
  const { data: employer, isLoading, error } = usePayrollEmployerSync(orgId)
  const createProfile   = useCreatePayrollEmployerProfile(orgId)
  const setMapping       = useSetPayrollAccountMapping(orgId)
  const startOnboarding  = useStartPayrollEmployerOnboarding(orgId)

  const [accounts, setAccounts]         = useState<Account[]>([])
  const [accountsLoaded, setAccountsLoaded] = useState(false)

  const [payFrequency, setPayFrequency] = useState<PayrollPayFrequency>('biweekly')
  const [cashAccountId, setCashAccountId]           = useState('')
  const [expenseAccountId, setExpenseAccountId]     = useState('')
  const [taxExpenseAccountId, setTaxExpenseAccountId] = useState('')

  const [signerName, setSignerName]   = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [wpLine1, setWpLine1]         = useState('')
  const [wpCity, setWpCity]           = useState('')
  const [wpState, setWpState]         = useState<SupportedPayrollState>('VA')
  const [wpPostalCode, setWpPostalCode] = useState('')

  const [formError, setFormError]     = useState<string | null>(null)
  const [onboardUrl, setOnboardUrl]   = useState<string | null>(null)
  const [creatingDefaults, setCreatingDefaults] = useState(false)

  const refreshAccounts = useCallback(async () => {
    const a = await getAccounts(orgId, { clientId: clientId ?? null })
    setAccounts(a)
    return a
  }, [orgId, clientId])

  useEffect(() => {
    let alive = true
    refreshAccounts()
      .then(() => { if (alive) setAccountsLoaded(true) })
      .catch(() => { if (alive) setAccountsLoaded(true) })
    return () => { alive = false }
  }, [refreshAccounts])

  // Only meaningful for firm-managed clients — see file header comment.
  const hasPayrollExpenseAccount = accounts.some(a => /payroll expense/i.test(a.name))
  const hasPayrollTaxAccount     = accounts.some(a => /payroll tax/i.test(a.name))

  async function handleQuickCreatePayrollAccounts() {
    if (!clientId) return
    setFormError(null)
    setCreatingDefaults(true)
    try {
      const expenseCodes = accounts
        .filter(a => a.type === 'expense')
        .map(a => parseInt(a.code, 10))
        .filter(n => !isNaN(n))
      const nextCode = (expenseCodes.length > 0 ? Math.max(...expenseCodes) : 6000) + 10

      let newExpenseId = expenseAccountId
      let newTaxId = taxExpenseAccountId

      if (!hasPayrollExpenseAccount) {
        const created = await createAccount({
          orgId, clientId,
          code: String(nextCode),
          name: 'Payroll Expense',
          type: 'expense',
          normalBalance: 'debit'
        })
        newExpenseId = created.id
      }
      if (!hasPayrollTaxAccount) {
        const created = await createAccount({
          orgId, clientId,
          code: String(nextCode + 10),
          name: 'Payroll Tax Expense (Employer)',
          type: 'expense',
          normalBalance: 'debit'
        })
        newTaxId = created.id
      }

      const refreshed = await refreshAccounts()
      if (!expenseAccountId) {
        const match = refreshed.find(a => a.id === newExpenseId) ?? refreshed.find(a => /payroll expense/i.test(a.name))
        if (match) setExpenseAccountId(match.id)
      }
      if (!taxExpenseAccountId) {
        const match = refreshed.find(a => a.id === newTaxId) ?? refreshed.find(a => /payroll tax/i.test(a.name))
        if (match) setTaxExpenseAccountId(match.id)
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not create default payroll accounts')
    } finally {
      setCreatingDefaults(false)
    }
  }

  // "Employer profile doesn't exist yet" surfaces as a thrown RPC error —
  // that's the expected first-run state, not a fatal error.
  const profileMissing = !!error && /before syncing|not found|employer profile/i.test(error.message)

  async function handleCreateProfile() {
    setFormError(null)
    try {
      await createProfile.mutateAsync(payFrequency)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not create payroll profile')
    }
  }

  async function handleSetMapping() {
    setFormError(null)
    if (!cashAccountId || !expenseAccountId || !taxExpenseAccountId) {
      setFormError('Select all three accounts before saving.')
      return
    }
    try {
      await setMapping.mutateAsync({
        org_id: orgId,
        cash_account_id: cashAccountId,
        payroll_expense_account_id: expenseAccountId,
        payroll_tax_expense_account_id: taxExpenseAccountId
      })
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save account mapping')
    }
  }

  async function handleStartOnboarding() {
    setFormError(null)
    setOnboardUrl(null)
    if (!signerName.trim() || !signerTitle.trim() || !signerEmail.trim() ||
        !wpLine1.trim() || !wpCity.trim() || !wpPostalCode.trim()) {
      setFormError('Fill in the signatory and workplace address fields.')
      return
    }
    try {
      const result = await startOnboarding.mutateAsync({
        org_id: orgId,
        signer_name: signerName.trim(),
        signer_title: signerTitle.trim(),
        signer_email: signerEmail.trim(),
        workplace_address: {
          line1: wpLine1.trim(),
          city: wpCity.trim(),
          state: wpState,
          postal_code: wpPostalCode.trim()
        }
      })
      setOnboardUrl(result.onboard_url)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not start Check onboarding')
    }
  }

  if (isLoading) {
    return <div style={cardStyle}><span style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading payroll setup…</span></div>
  }

  // ── Step 1: no employer profile yet ──────────────────────────────────
  if (profileMissing) {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>Set up payroll</div>
        <p style={subtitleStyle}>Choose a default pay frequency to get started. You can change this later.</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={labelStyle}>Pay frequency</label>
            <select
              className="lp-input"
              value={payFrequency}
              onChange={e => setPayFrequency(e.target.value as PayrollPayFrequency)}
              disabled={!canConfigure}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="semimonthly">Semimonthly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <Button variant="primary" loading={createProfile.isPending} disabled={!canConfigure} onClick={handleCreateProfile}>
            Create payroll profile
          </Button>
        </div>
        {formError && <ErrorBanner message={formError} />}
      </div>
    )
  }

  if (error && !profileMissing) {
    return <div style={cardStyle}><ErrorBanner message={error.message} /></div>
  }

  if (!employer) return null

  // payroll_get_employer_for_sync doesn't return onboarding_status (it's a
  // sync-focused DTO, not the full employer_profiles row), so this card
  // can't tell from here whether account mapping was already saved.
  // payroll_set_account_mapping is a plain UPDATE (idempotent), so the form
  // is always shown rather than guessed-hidden — safe to resubmit, and the
  // "Saved ✓" confirmation after a successful call is the actual signal.

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>Payroll setup — {employer.legal_name}</div>

      <div style={rowStyle}>
        <StatusPill label="EIN" value={employer.ein ?? 'Not set on org'} ok={!!employer.ein} />
        <StatusPill label="Pay frequency" value={employer.pay_frequency} ok />
        <StatusPill label="Check company" value={employer.provider_company_id ?? 'Not synced'} ok={!!employer.provider_company_id} />
        <StatusPill label="Check workplace" value={employer.provider_workplace_id ?? 'Not synced'} ok={!!employer.provider_workplace_id} />
      </div>

      {/* Account mapping */}
      {canConfigure && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Ledger account mapping</div>
          {!accountsLoaded ? (
            <span style={{ color: 'var(--lp-text-muted)', fontSize: 12.5 }}>Loading accounts…</span>
          ) : accounts.length === 0 && !clientId ? (
            <p style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
              No accounts found. <a href="/accounts" style={{ color: 'var(--lp-accent)' }}>Create your Chart of Accounts</a> first
              (you'll need a Cash account, a Payroll Expense account, and a Payroll Tax Expense account).
            </p>
          ) : (
            <>
              {clientId && (!hasPayrollExpenseAccount || !hasPayrollTaxAccount) && (
                <div style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--lp-muted-bg)', border: '0.5px solid var(--lp-border)', borderRadius: 7 }}>
                  <span style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginRight: 8 }}>
                    This client is missing a Payroll Expense / Payroll Tax Expense account.
                  </span>
                  <Button variant="ghost" size="sm" loading={creatingDefaults} onClick={handleQuickCreatePayrollAccounts}>
                    Quick-create payroll accounts
                  </Button>
                </div>
              )}
              {accounts.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
                  No accounts yet — you'll still need a Cash account (create it from{' '}
                  <a href="/accounts" style={{ color: 'var(--lp-accent)' }}>Chart of Accounts</a>) before you can save this mapping.
                </p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <AccountSelect label="Cash account" accounts={accounts} value={cashAccountId} onChange={setCashAccountId} />
                    <AccountSelect label="Payroll Expense account" accounts={accounts} value={expenseAccountId} onChange={setExpenseAccountId} />
                    <AccountSelect label="Payroll Tax Expense account" accounts={accounts} value={taxExpenseAccountId} onChange={setTaxExpenseAccountId} />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Button variant="primary" size="sm" loading={setMapping.isPending} onClick={handleSetMapping}>
                      Save account mapping
                    </Button>
                    {setMapping.isSuccess && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--sem-green)' }}>Saved ✓</span>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Check onboarding */}
      {canConfigure && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Connect to Check</div>
          <p style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginBottom: 10 }}>
            Enter the signatory and primary workplace, then open Check's secure onboarding to finish
            compliance setup (legal address, tax parameters, bank account). LedgiProof never sees SSNs or bank details.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <TextField label="Signer name" value={signerName} onChange={setSignerName} />
            <TextField label="Signer title" value={signerTitle} onChange={setSignerTitle} placeholder="Owner, CFO..." />
            <TextField label="Signer email" value={signerEmail} onChange={setSignerEmail} type="email" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <TextField label="Workplace address" value={wpLine1} onChange={setWpLine1} placeholder="123 Main St" />
            <TextField label="City" value={wpCity} onChange={setWpCity} />
            <div>
              <label style={labelStyle}>State</label>
              <select className="lp-input" value={wpState} onChange={e => setWpState(e.target.value as SupportedPayrollState)}>
                {PAYROLL_SUPPORTED_STATES.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
              </select>
            </div>
            <TextField label="ZIP" value={wpPostalCode} onChange={setWpPostalCode} />
          </div>
          <Button variant="primary" size="sm" loading={startOnboarding.isPending} onClick={handleStartOnboarding}>
            {employer.provider_company_id ? 'Resume Check onboarding' : 'Start Check onboarding'}
          </Button>
          {onboardUrl && (
            <a href={onboardUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 10 }}>
              <Button variant="success" size="sm">Open Check onboarding →</Button>
            </a>
          )}
        </div>
      )}

      {formError && <ErrorBanner message={formError} />}
    </div>
  )
}

// ── Small presentational helpers ─────────────────────────────────────────

function AccountSelect({ label, accounts, value, onChange }: {
  label: string; accounts: Account[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select className="lp-input" value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%' }}>
        <option value="">Select…</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
      </select>
    </div>
  )
}

function TextField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        className="lp-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
    </div>
  )
}

function StatusPill({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{
      padding: '6px 10px',
      borderRadius: 7,
      background: ok ? 'var(--sem-green-bg)' : 'var(--lp-muted-bg)',
      border: `0.5px solid ${ok ? 'var(--sem-green-border)' : 'var(--lp-border)'}`,
      fontSize: 11.5
    }}>
      <span style={{ color: 'var(--lp-text-muted)', marginRight: 6 }}>{label}:</span>
      <span style={{ color: ok ? 'var(--sem-green)' : 'var(--lp-text)' }}>{value}</span>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      marginTop: 10,
      padding: '8px 12px',
      background: 'var(--sem-red-bg)',
      border: '0.5px solid var(--sem-red)',
      borderRadius: 7,
      color: 'var(--sem-red)',
      fontSize: 12
    }}>
      ⚠ {message}
    </div>
  )
}

// ── Shared inline styles (matches AddClientDialog conventions) ──────────

const cardStyle: React.CSSProperties = {
  padding: 16,
  background: 'var(--lp-surface)',
  border: '0.5px solid var(--lp-border-2)',
  borderRadius: 12,
  marginBottom: 16
}

const titleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6
}

const subtitleStyle: React.CSSProperties = {
  fontSize: 12.5, color: 'var(--lp-text-muted)', marginBottom: 12
}

const rowStyle: React.CSSProperties = {
  display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12
}

const sectionStyle: React.CSSProperties = {
  paddingTop: 14, marginTop: 14, borderTop: '0.5px solid var(--lp-border)'
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 8
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--lp-text-muted)', marginBottom: 5
}
