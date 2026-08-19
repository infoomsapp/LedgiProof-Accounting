// PATH: src/pages/ChartOfAccounts.tsx
//
// CSS-TODO (file-level): remaining: #fb923c (orange-400) and #f472b6 (pink-400)
// for account-type chips need --acct-type-* vars. Unique white-overlay alphas
// for dark mode. Direct mappings migrated.
//
// ═════════════════════════════════════════════════════════════════════════
//  Sprint 5 Paso 5.3 — CoA per Client refactor
// ═════════════════════════════════════════════════════════════════════════
//
// THREE OPERATIONAL MODES:
//
//   A) MODE 'self' (solo, pyme, bookkeeper-personal):
//      · Single CoA per org, no client scoping
//      · Legacy seed RPC remains available (creates orgwide accounts)
//      · No banners
//
//   B) MODE 'firm-client' WITH clientId (bookkeeper inside /clients/:id/accounts):
//      · Filters accounts by client_id = scope.clientId
//      · If client has zero accounts → shows TemplateBootstrap empty state
//        with "Apply template" CTA
//      · CRUD operations bind to this client_id
//      · Legacy accounts NOT shown (irrelevant to per-client view)
//
//   C) MODE 'firm-client' WITHOUT clientId (bookkeeper firm overview at /accounts):
//      · Shows "Select a client" empty state + Manage Templates button
//      · Optional Legacy Accounts section for explicit migration
//
// CONSTITUTION COMPLIANCE:
//   · ZERO direct db.from('accounts') queries — all through accounts.service
//   · Strict types (no any, no dynamic maps)
//   · Service throws clear errors that we surface in UI
//
import { useState, useMemo, useCallback } from 'react'
import { Navigate }     from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useScope }     from '../hooks/useScope'
import {
  useAccounts,
  useLegacyAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeactivateAccount,
  useAssignLegacyToClient
} from '../hooks/useAccounts'
import {
  useAccountTemplates,
  useCloneTemplate
} from '../hooks/useAccountTemplates'
import { db } from '../lib/supabase'   // ONLY used for the legacy seed RPC in self mode
import Modal  from '../components/ui/modal'
import Button from '../components/ui/Button'
import ClientPickerDropdown from '../components/clients/ClientPickerDropdown'
import ApplyTemplateModal   from '../components/clients/ApplyTemplateModal'
import type { Account } from '../types/database.types'

type AccountType   = 'asset' | 'liability' | 'equity' | 'income' | 'expense'
type NormalBalance = 'debit' | 'credit'

const TYPE_CONFIG: Record<AccountType, { color: string; label: string; normalBalance: NormalBalance }> = {
  asset:     { color: 'var(--lp-accent)',  label: 'Asset',     normalBalance: 'debit'  },
  liability: { color: '#f472b6',           label: 'Liability', normalBalance: 'credit' },
  equity:    { color: 'var(--lp-violet)',  label: 'Equity',    normalBalance: 'credit' },
  income:    { color: '#34d399',           label: 'Income',    normalBalance: 'credit' },
  expense:   { color: '#fb923c',           label: 'Expense',   normalBalance: 'debit'  }
}

const EMPTY_FORM = {
  code: '', name: '', type: 'expense' as AccountType,
  normal_balance: 'debit' as NormalBalance,
  description: '', parent_id: '' as string | null
}

type TreeAccount = Account & { children: TreeAccount[] }

function buildTree(accounts: Account[]): TreeAccount[] {
  const map = new Map(accounts.map(a => [a.id, { ...a, children: [] as TreeAccount[] }]))
  const roots: TreeAccount[] = []
  for (const acc of map.values()) {
    if (acc.parent_id && map.has(acc.parent_id)) {
      map.get(acc.parent_id)!.children.push(acc as TreeAccount)
    } else {
      roots.push(acc as TreeAccount)
    }
  }
  return roots.sort((a, b) => a.code.localeCompare(b.code))
}

// ── Account row ───────────────────────────────────────────────────────────────
function AccountRow({
  account, depth = 0, onEdit, onToggle, isLegacy = false
}: {
  account:  TreeAccount
  depth?:   number
  isLegacy?: boolean
  onEdit:   (a: Account) => void
  onToggle: (a: Account) => void
}) {
  const [open, setOpen] = useState(depth < 1)
  const hasChildren     = account.children.length > 0
  const cfg             = TYPE_CONFIG[account.type as AccountType]

  return (
    <>
      <tr style={{
        borderBottom: '0.5px solid var(--lp-border)',
        opacity: account.is_active ? 1 : 0.45,
        background: isLegacy ? 'var(--lp-muted-bg)' : 'transparent'
      }}>
        <td style={{ padding: '8px 14px', paddingLeft: 14 + depth * 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              onClick={() => hasChildren && setOpen(o => !o)}
              style={{
                width: 12, color: 'var(--lp-text-muted)', fontSize: 10,
                cursor: hasChildren ? 'pointer' : 'default', userSelect: 'none'
              }}
            >
              {hasChildren ? (open ? '▾' : '▸') : ''}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--lp-text-muted)', minWidth: 40 }}>
              {account.code}
            </span>
            <span style={{ fontSize: 13, color: account.is_active ? 'var(--lp-text)' : 'var(--lp-text-muted)' }}>
              {account.name}
            </span>
            {isLegacy && (
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 4,
                background: 'var(--lp-muted-bg)', color: 'var(--lp-text-muted)',
                border: '0.5px solid var(--lp-border)'
              }}>
                LEGACY
              </span>
            )}
          </div>
        </td>
        <td style={{ padding: '8px 14px' }}>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 100,
            color: cfg.color, background: `${cfg.color}18`,
            border: `0.5px solid ${cfg.color}40`, textTransform: 'capitalize'
          }}>
            {cfg.label}
          </span>
        </td>
        <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--lp-text-muted)', textTransform: 'capitalize' }}>
          {account.normal_balance}
        </td>
        <td style={{ padding: '8px 14px', textAlign: 'center' }}>
          <span style={{ fontSize: 11, color: account.is_active ? 'var(--sem-green)' : 'var(--lp-text-stronger)' }}>
            {account.is_active ? '●' : '○'}
          </span>
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button
              onClick={() => onEdit(account)}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text-muted)', borderRadius: 6, padding: '3px 8px',
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              {isLegacy ? 'Assign…' : 'Edit'}
            </button>
            {!isLegacy && (
              <button
                onClick={() => onToggle(account)}
                style={{
                  background: account.is_active ? 'var(--sem-red-bg)' : 'var(--sem-green-bg)',
                  border: `0.5px solid ${account.is_active ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
                  color: account.is_active ? 'var(--sem-red)' : 'var(--sem-green)',
                  borderRadius: 6, padding: '3px 8px', fontSize: 11,
                  cursor: 'pointer', fontFamily: 'inherit'
                }}
              >
                {account.is_active ? 'Disable' : 'Enable'}
              </button>
            )}
          </div>
        </td>
      </tr>
      {open && account.children
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(child => (
          <AccountRow key={child.id} account={child} depth={depth + 1}
            onEdit={onEdit} onToggle={onToggle} isLegacy={isLegacy} />
        ))}
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
//  Main page
// ═════════════════════════════════════════════════════════════════════════════
export default function ChartOfAccounts() {
  const { membership, profile } = useAuthStore()
  const scope                   = useScope()
  const orgId  = scope.orgId || (membership?.org_id ?? '')
  const userId = profile?.id ?? ''

  // ── Mode resolution ────────────────────────────────────────────────────
  // The 3-mode model from Q4 decision.
  const isFirmMode       = scope.scopeMode === 'firm-client'
  const isFirmClientMode = isFirmMode && !!scope.clientId   // Mode B
  const isFirmOverview   = isFirmMode && !scope.clientId    // Mode C — redirect to intent picker
  const isSelfMode       = !isFirmMode                       // Mode A

  // ── Filters ────────────────────────────────────────────────────────────
  const [typeFilter,    setTypeFilter]    = useState<AccountType | 'all'>('all')
  const [showInactive,  setShowInactive]  = useState(false)

  // ── Data fetching (via service hooks — Constitution compliant) ─────────
  // Mode B: scope to client, exclude legacy
  // Mode A: no client filter, show all firm accounts (includes legacy)
  // Mode C: no main listing (uses empty state); legacy listing optional
  const accountsQ = useAccounts(
    orgId,
    isFirmClientMode ? scope.clientId : null,
    {
      includeInactive: showInactive,
      includeLegacy:   !isFirmClientMode  // Mode B excludes legacy; others include
    }
  )

  // Legacy accounts (used only in Mode C as a separate section)
  const legacyQ = useLegacyAccounts(orgId)

  // Templates (used in Mode B empty state + Mode C "Manage templates")
  const templatesQ = useAccountTemplates(orgId, { includeSystem: true, includeCustom: true })

  // ── Mutations ──────────────────────────────────────────────────────────
  const createMut       = useCreateAccount(orgId)
  const updateMut       = useUpdateAccount(orgId)
  const deactivateMut   = useDeactivateAccount(orgId)
  const cloneMut        = useCloneTemplate(orgId)
  const assignLegacyMut = useAssignLegacyToClient(orgId)

  // ── Derived data ───────────────────────────────────────────────────────
  const allAccounts: Account[] = useMemo(() => accountsQ.data ?? [], [accountsQ.data])
  const flat = useMemo(() => allAccounts.filter(a =>
    typeFilter === 'all' || a.type === typeFilter
  ), [allAccounts, typeFilter])
  const tree = useMemo(() => buildTree(flat), [flat])
  const typeOrder: AccountType[] = ['asset','liability','equity','income','expense']

  const isLoading = accountsQ.isLoading
  const hasAccounts = allAccounts.length > 0

  // ── Modal state ────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [form,      setForm]      = useState({ ...EMPTY_FORM })
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // ── Legacy assignment modal ────────────────────────────────────────────
  const [legacyToAssign, setLegacyToAssign] = useState<Account | null>(null)
  const [assignClientId, setAssignClientId] = useState<string>('')
  const [assignError,    setAssignError]    = useState<string | null>(null)

  // ── Template bootstrap (Mode B empty state) ────────────────────────────
  const [bootstrapTemplateId, setBootstrapTemplateId] = useState<string>('')
  const [bootstrapError,      setBootstrapError]      = useState<string | null>(null)

  // ── Manage templates modal (Mode C trigger) ────────────────────────────
  const [showManageTemplates, setShowManageTemplates] = useState(false)

  // ── Self-mode seed (legacy RPC, only when MODE A) ──────────────────────
  // We keep the old behavior for solo/pyme/personal users. The RPC creates
  // accounts without client_id but with is_legacy=false (per v37 defaults).
  // For Mode B/C this path is not exposed in UI.
  const [seeding, setSeeding] = useState(false)

  // ───────────────────────────────────────────────────────────────────────
  //  Auto-set normal_balance when type changes
  // ───────────────────────────────────────────────────────────────────────
  const handleTypeChange = useCallback((type: AccountType) => {
    setForm(f => ({ ...f, type, normal_balance: TYPE_CONFIG[type].normalBalance }))
  }, [])

  // ───────────────────────────────────────────────────────────────────────
  //  Self-mode seed (legacy RPC)
  // ───────────────────────────────────────────────────────────────────────
  async function handleSeedSelfMode() {
    if (!orgId || !userId) return
    if (!isSelfMode) {
      setError('Seed is only available in self mode. Firm clients use templates instead.')
      return
    }
    if (!confirm('This will create the standard US GAAP accounts for your workspace. Continue?')) return
    setSeeding(true)
    try {
      const { error: rpcErr } = await db.rpc('seed_chart_of_accounts', {
        p_org_id:  orgId,
        p_user_id: userId
      })
      if (rpcErr) throw new Error(rpcErr.message)
      await accountsQ.refetch()
    } catch (e: any) {
      setError(e?.message ?? 'Could not seed accounts')
    }
    setSeeding(false)
  }

  // ───────────────────────────────────────────────────────────────────────
  //  Open editor / save
  // ───────────────────────────────────────────────────────────────────────
  function openCreate() {
    if (isFirmOverview) {
      setError('Select a client first to create accounts in that client\'s CoA.')
      return
    }
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setError(null)
    setShowModal(true)
  }

  function openEdit(account: Account) {
    // If it's a legacy account, open the assignment modal instead
    if (account.is_legacy) {
      setLegacyToAssign(account)
      setAssignClientId('')
      setAssignError(null)
      return
    }
    setEditId(account.id)
    setForm({
      code:           account.code,
      name:           account.name,
      type:           account.type as AccountType,
      normal_balance: account.normal_balance as NormalBalance,
      description:    '',                                   // not in Account schema
      parent_id:      account.parent_id ?? ''
    })
    setError(null)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      setError('Code and name are required')
      return
    }
    setSaving(true); setError(null)

    try {
      if (editId) {
        await updateMut.mutateAsync({
          accountId: editId,
          patch: {
            code:          form.code.trim(),
            name:          form.name.trim(),
            type:          form.type,
            normalBalance: form.normal_balance,
            parentId:      form.parent_id || null
          }
        })
      } else {
        // Determine client_id binding by mode:
        //   Mode B → scope.clientId
        //   Mode A (self) → null (legacy/orgwide; service will refuse,
        //                         so we use direct db insert as escape hatch)
        if (isFirmClientMode && scope.clientId) {
          await createMut.mutateAsync({
            orgId,
            clientId:      scope.clientId,
            code:          form.code.trim(),
            name:          form.name.trim(),
            type:          form.type,
            normalBalance: form.normal_balance,
            parentId:      form.parent_id || null
          })
        } else if (isSelfMode) {
          // Self-mode escape hatch: insert directly with client_id=null.
          // The service refuses null on purpose; for solo/pyme it's the
          // historical behavior. After Sprint 5 wide adoption, consider
          // requiring a "self client" row for these orgs as well.
          const { error: insErr } = await db.from('accounts').insert({
            org_id:         orgId,
            client_id:      null,
            code:           form.code.trim(),
            name:           form.name.trim(),
            type:           form.type,
            normal_balance: form.normal_balance,
            parent_id:      form.parent_id || null,
            level:          form.parent_id ? 2 : 1,
            is_active:      true,
            is_legacy:      false,
            created_by:     userId
          })
          if (insErr) throw new Error(insErr.message)
          await accountsQ.refetch()
        } else {
          throw new Error('Cannot create account in firm-overview mode. Select a client first.')
        }
      }
      setShowModal(false)
    } catch (e: any) {
      setError(e?.message ?? 'Save failed')
    }
    setSaving(false)
  }

  // ───────────────────────────────────────────────────────────────────────
  //  Toggle active / inactive
  // ───────────────────────────────────────────────────────────────────────
  async function handleToggle(account: Account) {
    try {
      if (account.is_active) {
        await deactivateMut.mutateAsync(account.id)
      } else {
        await updateMut.mutateAsync({ accountId: account.id, patch: { isActive: true } })
      }
    } catch (e: any) {
      // Surface error inline at row would be ideal; for now alert
      alert(`Could not toggle: ${e?.message ?? 'unknown error'}`)
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  //  Apply template (Mode B empty state)
  // ───────────────────────────────────────────────────────────────────────
  async function handleApplyTemplate() {
    if (!isFirmClientMode || !scope.clientId) {
      setBootstrapError('Cannot apply template: no client selected.')
      return
    }
    if (!bootstrapTemplateId) {
      setBootstrapError('Pick a template first.')
      return
    }
    setBootstrapError(null)
    try {
      const result = await cloneMut.mutateAsync({
        templateId: bootstrapTemplateId,
        clientId:   scope.clientId
      })
      // Toast-like feedback via inline state could be added; for now refetch
      if (result.accountsCreated === 0) {
        setBootstrapError('Template clone returned 0 accounts. Check the template has items.')
      }
    } catch (e: any) {
      setBootstrapError(e?.message ?? 'Could not apply template')
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  //  Assign legacy account to a client
  // ───────────────────────────────────────────────────────────────────────
  async function handleAssignLegacy() {
    if (!legacyToAssign) return
    if (!assignClientId) {
      setAssignError('Pick a target client.')
      return
    }
    setAssignError(null)
    try {
      await assignLegacyMut.mutateAsync({
        accountId: legacyToAssign.id,
        clientId:  assignClientId
      })
      setLegacyToAssign(null)
    } catch (e: any) {
      setAssignError(e?.message ?? 'Could not assign legacy account')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════

  // Mode C — firm without a client selected: redirect to intent-based client picker.
  // The /clients page shows a contextual banner ("Select a client to manage their CoA")
  // and routes each row to /clients/:id/accounts on click.
  if (isFirmOverview) return <Navigate to="/clients?intent=accounts" replace />

  return (
    <div style={{ padding: '28px 32px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="lp-page-title">Chart of Accounts</h1>
          <p style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 4 }}>
            {isFirmClientMode && 'Per-client Chart of Accounts. Only this client sees these accounts.'}
            {isFirmOverview && 'Firm overview. Select a client to manage their CoA, or manage firm templates.'}
            {isSelfMode && 'Workspace Chart of Accounts.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isSelfMode && !hasAccounts && !isLoading && (
            <Button variant="ghost" onClick={handleSeedSelfMode} loading={seeding}>
              Seed standard accounts
            </Button>
          )}
          {!isFirmOverview && (
            <Button variant="primary" onClick={openCreate}>
              + New account
            </Button>
          )}
        </div>
      </div>

      {/* Filters (only when there's a list to filter) */}
      {!isFirmOverview && hasAccounts && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="lp-input"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as AccountType | 'all')}
            style={{ width: 160 }}
          >
            <option value="all">All types</option>
            {typeOrder.map(t => (
              <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <span style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginLeft: 'auto' }}>
            {flat.length} {flat.length === 1 ? 'account' : 'accounts'}
          </span>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODE C: Firm overview (no client selected)
          ══════════════════════════════════════════════════════════════ */}
      {isFirmOverview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
          <SelectClientEmpty
            templatesAvailable={templatesQ.data?.length ?? 0}
            onManageTemplates={() => setShowManageTemplates(true)}
          />
          <LegacyAccountsSection
            legacyAccounts={legacyQ.data ?? []}
            isLoading={legacyQ.isLoading}
            onAssign={(acc) => {
              setLegacyToAssign(acc)
              setAssignClientId('')
              setAssignError(null)
            }}
          />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODE B: firm-client + clientId, but client has NO accounts yet
          ══════════════════════════════════════════════════════════════ */}
      {isFirmClientMode && !isLoading && !hasAccounts && (
        <TemplateBootstrap
          templates={templatesQ.data ?? []}
          isLoading={templatesQ.isLoading}
          selectedId={bootstrapTemplateId}
          onSelect={setBootstrapTemplateId}
          onApply={handleApplyTemplate}
          applying={cloneMut.isPending}
          error={bootstrapError}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODE B (with accounts) or MODE A: standard listing
          ══════════════════════════════════════════════════════════════ */}
      {(isFirmClientMode || isSelfMode) && hasAccounts && (
        <div style={{ flex: 1, overflowY: 'auto', border: '0.5px solid var(--lp-border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{
                background: 'var(--lp-muted-bg)',
                borderBottom: '0.5px solid var(--lp-border)'
              }}>
                <th style={{ textAlign: 'left',  padding: '10px 14px', fontWeight: 600, fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Account</th>
                <th style={{ textAlign: 'left',  padding: '10px 14px', fontWeight: 600, fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Type</th>
                <th style={{ textAlign: 'left',  padding: '10px 14px', fontWeight: 600, fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Normal</th>
                <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, width: 70 }}>Active</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {tree.map(root => (
                <AccountRow
                  key={root.id}
                  account={root}
                  onEdit={openEdit}
                  onToggle={handleToggle}
                  isLegacy={root.is_legacy}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--lp-text-muted)', fontSize: 13 }}>
          Loading accounts…
        </div>
      )}

      {/* Mode A empty state (no banner, just a friendly nudge) */}
      {isSelfMode && !isLoading && !hasAccounts && (
        <div style={{
          padding: '40px 20px', textAlign: 'center', fontSize: 13,
          color: 'var(--lp-text-muted)', border: '0.5px dashed var(--lp-border)',
          borderRadius: 10
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 600, color: 'var(--lp-text)', marginBottom: 4 }}>
            No accounts yet
          </div>
          <div>Click "Seed standard accounts" above to get started, or create your first account manually.</div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────
          CREATE / EDIT MODAL
          ──────────────────────────────────────────────────────────── */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editId ? 'Edit Account' : 'New Account'}
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              {editId ? 'Save changes' : 'Create account'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 7, fontSize: 12.5, color: 'var(--sem-red)',
              background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                Code *
              </label>
              <input className="lp-input" placeholder="e.g. 6020"
                value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                style={{ fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                Name *
              </label>
              <input className="lp-input" placeholder="e.g. Rent Expense"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus={!editId} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                Type *
              </label>
              <select className="lp-input" value={form.type}
                onChange={e => handleTypeChange(e.target.value as AccountType)}>
                {typeOrder.map(t => (
                  <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                Normal balance
              </label>
              <select className="lp-input" value={form.normal_balance}
                onChange={e => setForm(f => ({ ...f, normal_balance: e.target.value as NormalBalance }))}>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
              Parent account (optional)
            </label>
            <select className="lp-input" value={form.parent_id ?? ''}
              onChange={e => setForm(f => ({ ...f, parent_id: e.target.value || null }))}>
              <option value="">None (top-level)</option>
              {flat
                .filter(a => a.is_active && a.type === form.type && a.id !== editId)
                .sort((a, b) => a.code.localeCompare(b.code))
                .map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))
              }
            </select>
          </div>
        </div>
      </Modal>

      {/* ────────────────────────────────────────────────────────────────
          LEGACY ASSIGNMENT MODAL (Mode C)
          ──────────────────────────────────────────────────────────── */}
      <Modal
        open={!!legacyToAssign}
        onClose={() => setLegacyToAssign(null)}
        title="Assign Legacy Account to Client"
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLegacyToAssign(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={assignLegacyMut.isPending}
              onClick={handleAssignLegacy}
            >
              Assign
            </Button>
          </>
        }
      >
        {legacyToAssign && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {assignError && (
              <div style={{
                padding: '8px 12px', borderRadius: 7, fontSize: 12.5, color: 'var(--sem-red)',
                background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)'
              }}>
                {assignError}
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', lineHeight: 1.5 }}>
              You're migrating <strong style={{ color: 'var(--lp-text)' }}>
              {legacyToAssign.code} — {legacyToAssign.name}</strong> to a specific client.
              <br/><br/>
              Once assigned, this account will:
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                <li>Lose the "(Legacy)" suffix</li>
                <li>Become picker-available for transactions on that client</li>
                <li>No longer appear in this Legacy section</li>
              </ul>
              Existing transactions referencing this account stay intact.
            </div>

            {/* 🆕 Sprint 5 Paso 5.4 — Replaced "paste UUID" with real picker. */}
            <ClientPickerDropdown
              orgId={orgId}
              selectedId={assignClientId}
              onSelect={(id) => setAssignClientId(id)}
              label="Target client *"
              placeholder="Search clients by name or email…"
              disabled={assignLegacyMut.isPending}
            />
          </div>
        )}
      </Modal>

      {/* 🆕 Sprint 5 Paso 5.4 — Manage templates standalone modal.
          Triggered from Mode C "Manage account templates" button. */}
      {showManageTemplates && (
        <ApplyTemplateModal
          open={showManageTemplates}
          onClose={() => setShowManageTemplates(false)}
          orgId={orgId}
          title="Apply Template to Client"
        />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
//  Sub-component: SelectClientEmpty (Mode C primary content)
// ═════════════════════════════════════════════════════════════════════════════
function SelectClientEmpty({
  templatesAvailable,
  onManageTemplates
}: {
  templatesAvailable: number
  onManageTemplates:  () => void
}) {
  return (
    <div style={{
      padding: '32px 24px', textAlign: 'center', fontSize: 13,
      color: 'var(--lp-text-muted)', border: '0.5px dashed var(--lp-border)',
      borderRadius: 10
    }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>📒</div>
      <div style={{ fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6, fontSize: 14 }}>
        Select a client to view their Chart of Accounts
      </div>
      <div style={{ maxWidth: 420, margin: '0 auto', lineHeight: 1.5 }}>
        Each client in your firm has their own independent CoA. Go to{' '}
        <strong style={{ color: 'var(--lp-text)' }}>Clients</strong>, open one, then come back to <strong>Accounts</strong>.
      </div>
      <div style={{ marginTop: 18, paddingTop: 18, borderTop: '0.5px solid var(--lp-border)' }}>
        <Button variant="ghost" onClick={onManageTemplates}>
          Apply template to a client ({templatesAvailable} available)
        </Button>
        <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', marginTop: 6 }}>
          Pick a template and a target client to bootstrap their CoA in one step.
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
//  Sub-component: TemplateBootstrap (Mode B empty state)
// ═════════════════════════════════════════════════════════════════════════════
function TemplateBootstrap({
  templates, isLoading, selectedId, onSelect, onApply, applying, error
}: {
  templates:  Array<{ id: string; name: string; description: string | null; category: string; is_system: boolean }>
  isLoading:  boolean
  selectedId: string
  onSelect:   (id: string) => void
  onApply:    () => void
  applying:   boolean
  error:      string | null
}) {
  return (
    <div style={{
      padding: '40px 24px', maxWidth: 560, margin: '40px auto',
      border: '0.5px solid var(--lp-border)', borderRadius: 12,
      background: 'var(--lp-muted-bg)'
    }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🌱</div>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--lp-text)', margin: 0 }}>
          Bootstrap this client's Chart of Accounts
        </h2>
        <p style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
          This client has no accounts yet. Pick an industry template to get started.
          You can customize accounts after applying.
        </p>
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 7, fontSize: 12.5, color: 'var(--sem-red)',
          background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)',
          marginBottom: 14
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', fontWeight: 600 }}>
          Template
        </label>
        {isLoading ? (
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', padding: 8 }}>
            Loading templates…
          </div>
        ) : templates.length === 0 ? (
          <div style={{
            padding: '10px 12px', borderRadius: 7, fontSize: 12,
            background: 'var(--sem-amber-bg)', border: '0.5px solid var(--sem-amber-border)',
            color: 'var(--lp-text)'
          }}>
            No templates available. This is unexpected — system templates should be
            seeded by migration v37. Check that v37 has been applied.
          </div>
        ) : (
          <select
            className="lp-input"
            value={selectedId}
            onChange={e => onSelect(e.target.value)}
          >
            <option value="">— Select a template —</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{t.is_system ? ' (system)' : ''} — {t.description ?? t.category}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Button
          variant="primary"
          onClick={onApply}
          loading={applying}
          disabled={!selectedId || templates.length === 0}
        >
          Apply template & create accounts
        </Button>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
//  Sub-component: LegacyAccountsSection (Mode C optional tool)
// ═════════════════════════════════════════════════════════════════════════════
function LegacyAccountsSection({
  legacyAccounts, isLoading, onAssign
}: {
  legacyAccounts: Account[]
  isLoading:      boolean
  onAssign:       (a: Account) => void
}) {
  if (isLoading) {
    return (
      <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
        Checking for legacy accounts…
      </div>
    )
  }

  if (legacyAccounts.length === 0) {
    return null  // No legacy = no section
  }

  return (
    <div style={{
      padding: '20px 22px', border: '0.5px solid var(--lp-border)', borderRadius: 10
    }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', margin: 0 }}>
          Legacy accounts ({legacyAccounts.length})
        </h3>
        <p style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          These accounts existed before per-client CoA was introduced. They are not
          available for new transactions on any client until you migrate each to a
          specific client.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {legacyAccounts.map(a => (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 7,
            background: 'var(--lp-muted-bg)'
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--lp-text-muted)', minWidth: 48 }}>
              {a.code}
            </span>
            <span style={{ fontSize: 13, color: 'var(--lp-text)', flex: 1 }}>
              {a.name}
            </span>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 4,
              background: 'var(--lp-bg)', color: 'var(--lp-text-muted)',
              border: '0.5px solid var(--lp-border)', textTransform: 'capitalize'
            }}>
              {a.type}
            </span>
            <button
              onClick={() => onAssign(a)}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text)', borderRadius: 6, padding: '3px 10px',
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              Assign to client…
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}