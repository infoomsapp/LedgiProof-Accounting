// PATH: src/pages/Invoices.tsx
//
// CSS-TODO (file-level): remaining: var(--sem-amber-soft) (amber-300) for warning text needs --sem-amber-soft. Unique white-overlay alphas for dark mode. Direct mappings migrated.
//
import { useState, useEffect, useCallback } from 'react'
import { useNavigate }         from 'react-router-dom'
import { useAuthStore }        from '../store/auth.store'
import { useChatBubbleStore }  from '../store/chat-bubble.store'
import { useScope }      from '../hooks/useScope'
import {
  getInvoices, getInvoice, createInvoice, updateInvoice,
  upsertItems, recordPayment, voidInvoice, getClients,
  markInvoiceSent, sendInvoiceEmail,
  type InvoiceWithClient
} from '../services/invoice.service'
import {
  INVOICE_STATUS_CONFIG, type InvoiceStatus, type InvoiceItem,
  type Client
} from '../types/database.types'
import Modal           from '../components/ui/modal'
import Button          from '../components/ui/Button'
import Icon            from '../components/ui/Icon'
import InvoicePrint    from '../components/Invoices/InvoicePrint'
import RecurringInvoicesTab from '../components/Invoices/RecurringInvoicesTab'
import AddClientDialog from '../components/clients/AddClientDialog'
import { getBranding, type Branding } from '../services/branding.service'
import InvoiceTaxSnapshotCard from '../components/Invoices/InvoiceTaxSnapshotCard'
import { lookupSalesTaxRate, getSalesTaxSettings } from '../services/sales-tax.service'
import { useOrgStore } from '../store/org.store'
import { calcLineTotals, calcDocumentTotals } from '../lib/lineItems'
import { formatCurrency } from '../lib/currency'
import { listTimeEntries, markEntriesBilled, durationToHours, type TimeEntry } from '../services/time-entry.service'

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const c = INVOICE_STATUS_CONFIG[status]
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
      color: c.color, background: c.bg, border: `0.5px solid ${c.border}`,
      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap'
    }}>
      {c.label}
    </span>
  )
}

// ── Line item editor row ───────────────────────────────────────────────────────
type DraftItem = Omit<InvoiceItem,
  'id' | 'invoice_id' | 'org_id' | 'created_at' |
  'line_subtotal' | 'line_discount' | 'line_tax' | 'line_total'>

function ItemRow({
  item, index, onChange, onDelete
}: {
  item: DraftItem; index: number
  onChange: (i: number, field: keyof DraftItem, val: string | number) => void
  onDelete: (i: number) => void
}) {
  // Same formula estimates use — see lib/lineItems.ts. Previously
  // duplicated inline here (and again in editorTotals below), so a
  // rounding or ordering fix in one place would silently not apply to
  // the other.
  const { line_total: lineTotal } = calcLineTotals(item)

  return (
    <tr>
      <td style={{ padding: '6px 4px' }}>
        <input className="lp-input" style={{ fontSize: 12.5 }}
          value={item.description}
          onChange={e => onChange(index, 'description', e.target.value)}
          placeholder="Description" />
      </td>
      <td style={{ padding: '6px 4px', width: 70 }}>
        <input className="lp-input" style={{ fontSize: 12.5, textAlign: 'right' }}
          type="number" min="0" step="0.01"
          value={item.quantity}
          onChange={e => onChange(index, 'quantity', parseFloat(e.target.value) || 0)} />
      </td>
      <td style={{ padding: '6px 4px', width: 100 }}>
        <input className="lp-input" style={{ fontSize: 12.5, textAlign: 'right' }}
          type="number" min="0" step="0.01"
          value={item.unit_price}
          onChange={e => onChange(index, 'unit_price', parseFloat(e.target.value) || 0)} />
      </td>
      <td style={{ padding: '6px 4px', width: 70 }}>
        <input className="lp-input" style={{ fontSize: 12.5, textAlign: 'right' }}
          type="number" min="0" max="100" step="0.01"
          value={item.discount_pct}
          title="Discount %"
          onChange={e => onChange(index, 'discount_pct', parseFloat(e.target.value) || 0)} />
      </td>
      <td style={{ padding: '6px 4px', width: 70 }}>
        <input className="lp-input" style={{ fontSize: 12.5, textAlign: 'right' }}
          type="number" min="0" max="100" step="0.01"
          value={item.tax_rate}
          title="Tax %"
          onChange={e => onChange(index, 'tax_rate', parseFloat(e.target.value) || 0)} />
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 12.5,
                   fontWeight: 500, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>
        {formatCurrency(lineTotal)}
      </td>
      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
        <button onClick={() => onDelete(index)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--lp-text-muted)', fontSize: 14
        }}>✕</button>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Invoices() {
  const { membership, profile }         = useAuthStore()
  const { activeOrg }                   = useOrgStore()
  const navigate                        = useNavigate()
  const { openChat }                    = useChatBubbleStore()
  // 🆕 Client Switcher Sprint 3 Paso 2 — scope-aware data access.
  // In firm-client mode (/clients/:clientId/invoices), scope.clientId
  // is set and getInvoices filters to that client. Self mode leaves it null.
  const scope                           = useScope()
  const orgId                           = scope.orgId || (membership?.org_id ?? '')
  const userId                          = profile?.id ?? ''

  const [invoices,    setInvoices]      = useState<InvoiceWithClient[]>([])
  const [clients,     setClients]       = useState<Client[]>([])
  const [loading,     setLoading]       = useState(true)
  const [filter,      setFilter]        = useState<InvoiceStatus | 'all'>('all')
  const [selected,    setSelected]      = useState<string | null>(null)
  const [detail,      setDetail]        = useState<any | null>(null)
  const [printing,    setPrinting]      = useState(false)
  const [linkCopiedId, setLinkCopiedId] = useState<string | null>(null)
  const [sendingId,    setSendingId]     = useState<string | null>(null)
  const [emailingId,   setEmailingId]    = useState<string | null>(null)
  const [emailSentId,  setEmailSentId]   = useState<string | null>(null)
  const [branding,    setBranding]      = useState<Branding | null>(null)
  const [tab,         setTab]           = useState<'invoices' | 'recurring'>('invoices')

  // Editor modal
  const [showEditor,  setShowEditor]    = useState(false)
  // editorMode existed as dead state: it was declared, set to 'create' once,
  // and never read. The Edit button called loadDetail(), which only opens the
  // read-only panel, so the app has never actually been able to change an
  // invoice. Both halves are wired up now.
  const [editorMode,  setEditorMode]    = useState<'create' | 'edit'>('create')
  const [editingId,   setEditingId]     = useState<string | null>(null)
  const [editClientId, setEditClientId] = useState('')
  const [editDueDate,  setEditDueDate]  = useState('')
  const [editTitle,    setEditTitle]    = useState('')
  const [editNotes,    setEditNotes]    = useState('')
  const [editItems,    setEditItems]    = useState<DraftItem[]>([])
  const [saving,       setSaving]       = useState(false)
  const [taxNote,      setTaxNote]      = useState<string | null>(null)
  const [taxResolving, setTaxResolving] = useState(false)
  // Time entries pulled in via "Add unbilled time" -- marked billed once
  // the invoice they were added to actually saves.
  const [pulledTimeIds, setPulledTimeIds] = useState<string[]>([])
  const [pullingTime,   setPullingTime]   = useState(false)

  // Payment modal
  const [showPayment, setShowPayment]   = useState(false)
  const [payAmount,   setPayAmount]     = useState('')
  const [payDate,     setPayDate]       = useState(new Date().toISOString().slice(0,10))
  const [payMethod,   setPayMethod]     = useState('bank_transfer')
  const [payRef,      setPayRef]        = useState('')
  const [payingSaving, setPayingSaving] = useState(false)

  // New client modal
  const [showNewClient, setShowNewClient] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [invs, clts] = await Promise.all([
      // 🆕 Sprint 3 Paso 2 — Use options form to include client scope filter.
      // Backward compat: scope.clientId is null in self mode → no extra filter.
      getInvoices(orgId, {
        ...(filter !== 'all' ? { status: filter } : {}),
        clientId: scope.clientId
      }),
      getClients(orgId)
    ])
    setInvoices(invs)
    setClients(clts)
    setLoading(false)
  }, [orgId, filter, scope.clientId])

  useEffect(() => { load() }, [load])

  // Org branding (logo/color/terms) for printable + public documents.
  useEffect(() => {
    if (!orgId) return
    getBranding(orgId).then(setBranding).catch(() => setBranding(null))
  }, [orgId])

  async function loadDetail(id: string) {
    const d = await getInvoice(id, orgId)
    setDetail(d)
    setSelected(id)
  }

  // ── P4 Fase 2.C B2 — Per-row void handler ─────────────────────────────
  // Constitution: invoices are NEVER physically deleted. Voiding is the
  // accounting-correct equivalent — status flips to 'void' and the row
  // stays for audit trail.
  async function handleVoidInvoice(inv: InvoiceWithClient) {
    if (inv.status === 'paid' || inv.status === 'void') return
    const ok = window.confirm(
      `Void invoice ${inv.invoice_number}?

` +
      `This marks the invoice as void in the audit trail. ` +
      `It cannot be undone.`
    )
    if (!ok) return
    try {
      await voidInvoice(inv.id)
      await load()
      if (selected === inv.id) {
        setSelected(null)
        setDetail(null)
      }
    } catch (e: any) {
      alert(`Could not void invoice: ${e?.message ?? 'unknown error'}`)
    }
  }

  // ── Send / copy public link ───────────────────────────────────────────────
  // Genera el public_token (si falta), marca la invoice como 'sent' y copia el
  // link público /i/:token al portapapeles para compartir con el cliente.
  async function handleSendLink(inv: InvoiceWithClient) {
    setSendingId(inv.id)
    try {
      const { url } = await markInvoiceSent(inv.id)
      try { await navigator.clipboard.writeText(url) } catch { /* clipboard optional */ }
      setLinkCopiedId(inv.id)
      setTimeout(() => setLinkCopiedId(null), 2000)
      await load()
    } catch (e: any) {
      alert(`Could not create the link: ${e?.message ?? 'unknown error'}`)
    } finally {
      setSendingId(null)
    }
  }

  // ── Email the invoice to the client ───────────────────────────────────────
  // Closes the gap "Send link" alone left: that button only ever copies a
  // URL to the clipboard, so the accountant still had to paste it into some
  // other channel themselves. This actually emails it. Ensures the invoice
  // is marked sent (and has a token) first, same as handleSendLink, since a
  // draft invoice has neither yet.
  async function handleEmailInvoice(inv: InvoiceWithClient) {
    setEmailingId(inv.id)
    try {
      if (inv.status === 'draft' || !inv.public_token) {
        await markInvoiceSent(inv.id)
      }
      await sendInvoiceEmail(inv.id)
      setEmailSentId(inv.id)
      setTimeout(() => setEmailSentId(null), 2500)
      await load()
    } catch (e: any) {
      alert(`Could not email the invoice: ${e?.message ?? 'unknown error'}`)
    } finally {
      setEmailingId(null)
    }
  }

  // ── Open editor ───────────────────────────────────────────────────────────
  function openCreate() {
    const due = new Date()
    due.setDate(due.getDate() + 30)
    setEditorMode('create')
    setEditingId(null)
    // 🆕 Sprint 3 — In firm-client scope, pre-fill the client from URL.
    // The bookkeeper is already 'inside' this client's workspace.
    setEditClientId(scope.clientId ?? clients[0]?.id ?? '')
    setEditDueDate(due.toISOString().slice(0,10))
    setEditTitle(''); setEditNotes('')
    setEditItems([{ sort_order:0, item_type:'service', description:'',
                    quantity:1, unit_price:0, discount_pct:0, tax_rate:0 }])
    setTaxNote(null)
    setPulledTimeIds([])
    setShowEditor(true)
  }

  // ── Open editor on an existing DRAFT ──────────────────────────────────────
  async function openEdit(id: string) {
    const inv = await getInvoice(id, orgId)
    if (inv.status !== 'draft') return   // the button is already gated; belt and braces
    setEditorMode('edit')
    setEditingId(id)
    setEditClientId(inv.client_id)
    setEditDueDate((inv.due_date ?? '').slice(0, 10))
    setEditTitle(inv.title ?? '')
    setEditNotes(inv.notes ?? '')
    setEditItems(
      inv.items.length > 0
        ? inv.items.map((it, i) => ({
            sort_order:   i,
            item_type:    it.item_type,
            description:  it.description,
            quantity:     it.quantity,
            unit_price:   it.unit_price,
            discount_pct: it.discount_pct,
            tax_rate:     it.tax_rate
          }))
        : [{ sort_order:0, item_type:'service', description:'',
             quantity:1, unit_price:0, discount_pct:0, tax_rate:0 }]
    )
    setTaxNote(null)
    setPulledTimeIds([])
    setShowEditor(true)
  }

  // ── Pull in unbilled time for the invoice's client ─────────────────────────
  async function pullUnbilledTime() {
    if (!editClientId) return
    setPullingTime(true)
    try {
      const unbilled = await listTimeEntries(orgId, { clientId: editClientId, unbilledOnly: true })
      if (unbilled.length === 0) return
      setEditItems(prev => {
        const base = prev.filter(i => i.description) // drop the empty starter row
        const timeItems: DraftItem[] = unbilled.map((e: TimeEntry, idx) => ({
          sort_order:   base.length + idx,
          item_type:    'service',
          description:  e.description || 'Time',
          quantity:     durationToHours(e.duration_minutes),
          unit_price:   e.hourly_rate,
          discount_pct: 0,
          tax_rate:     0
        }))
        return [...base, ...timeItems]
      })
      setPulledTimeIds(prev => [...prev, ...unbilled.map(e => e.id)])
    } finally {
      setPullingTime(false)
    }
  }

  async function autoFillSalesTax() {
    const client = clients.find(c => c.id === editClientId)
    if (!client)        { setTaxNote('Pick a client first.'); return }
    if (client.tax_exempt) {
      setTaxNote(`${client.display_name} is tax exempt${client.tax_exempt_reason ? ` (${client.tax_exempt_reason})` : ''} — no sales tax added.`)
      return
    }
    if (!client.state)  { setTaxNote('This client has no state on file — add an address to resolve sales tax.'); return }
    setTaxResolving(true); setTaxNote(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await lookupSalesTaxRate(client.state, {
        ...(client.postal_code ? { postal: client.postal_code } : {}),
        date: today
      })
      if (!res) { setTaxNote(`No sales-tax rate on file for ${client.state}.`); return }
      setEditItems(prev => prev.map(it => ({ ...it, tax_rate: res.ratePct })))
      setTaxNote(`Applied ${res.ratePct}% — ${res.jurisdiction} · ${res.source} (state rate; local precision via provider later).`)
    } catch (e: any) {
      setTaxNote(e?.message ?? 'Could not resolve sales tax')
    } finally { setTaxResolving(false) }
  }

  // Same idea as QuickBooks' automated sales tax: when the firm has turned on
  // "charge sales tax" (Settings), a NEW invoice fills each line's tax from the
  // client's state as soon as the client is known, so nobody types a percentage.
  // Exempt clients are skipped and told so; an existing draft is never touched.
  useEffect(() => {
    if (!showEditor || editorMode !== 'create' || !editClientId) return
    const client = clients.find(c => c.id === editClientId)
    if (!client) return
    if (client.tax_exempt) { void autoFillSalesTax(); return }
    let alive = true
    getSalesTaxSettings(orgId)
      .then(s => { if (alive && s?.collects_sales_tax) void autoFillSalesTax() })
      .catch(() => { /* the manual button is still there */ })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditor, editorMode, editClientId])

  function addItem() {
    setEditItems(prev => [...prev, {
      sort_order: prev.length, item_type: 'service',
      description: '', quantity: 1, unit_price: 0, discount_pct: 0, tax_rate: 0
    }])
  }

  function changeItem(i: number, field: keyof DraftItem, val: string | number) {
    setEditItems(prev => prev.map((item, idx) =>
      idx === i ? { ...item, [field]: val } : item
    ))
  }

  function deleteItem(i: number) {
    setEditItems(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Save invoice ──────────────────────────────────────────────────────────
  async function handleSave() {
    if (!editClientId || !editDueDate) return
    setSaving(true)
    // Real bug found and fixed: the client's own default_currency (set in
    // AddClientDialog) was collected and stored, but never actually read
    // here -- every invoice silently defaulted to USD regardless of what
    // currency the client was configured for.
    const clientCurrency = clients.find(c => c.id === editClientId)?.default_currency

    // Editing an existing draft: update the header, then rewrite the lines.
    // upsertItems deletes and reinserts, so it is the same call either way.
    if (editorMode === 'edit' && editingId) {
      await updateInvoice(editingId, {
        client_id: editClientId,
        due_date:  editDueDate,
        title:     editTitle || null,
        notes:     editNotes || null,
        ...(clientCurrency ? { currency: clientCurrency } : {})
      })
      await upsertItems(editingId, orgId, editItems.filter(i => i.description))
      if (pulledTimeIds.length > 0) {
        await markEntriesBilled(pulledTimeIds, editingId)
        setPulledTimeIds([])
      }
      setSaving(false)
      setShowEditor(false)
      await load()
      await loadDetail(editingId)
      return
    }

    const inv = await createInvoice({
      orgId, userId,
      clientId:  editClientId,
      dueDate:   editDueDate,
      ...(editTitle ? { title: editTitle } : {}),
      ...(editNotes ? { notes: editNotes } : {}),
      ...(clientCurrency ? { currency: clientCurrency } : {})
    })
    if (editItems.some(i => i.description)) {
      await upsertItems(inv.id, orgId, editItems.filter(i => i.description))
    }
    if (pulledTimeIds.length > 0) {
      await markEntriesBilled(pulledTimeIds, inv.id)
      setPulledTimeIds([])
    }
    setSaving(false)
    setShowEditor(false)
    await load()
    await loadDetail(inv.id)
  }

  // ── Record payment ────────────────────────────────────────────────────────
  async function handlePayment() {
    if (!selected || !payAmount) return
    setPayingSaving(true)
    await recordPayment({
      invoiceId:   selected,
      orgId, userId,
      amount:      parseFloat(payAmount),
      paymentDate: payDate,
      ...(payMethod ? { method: payMethod } : {}),
      ...(payRef ? { reference: payRef } : {})
    })
    setPayingSaving(false)
    setShowPayment(false)
    setPayAmount(''); setPayRef('')
    await load()
    await loadDetail(selected)
  }

  // ── Create client inline ──────────────────────────────────────────────────
  // Was a minimal name+email-only form built directly against createClient();
  // now shares AddClientDialog with every other "+ New client" entry point in
  // the app (LpAddMenu, /clients page) so this invoice-editor path can't drift
  // out of sync with the client schema again.
  async function handleClientCreated(clientId: string) {
    await load()
    setEditClientId(clientId)
  }

  // ── Computed totals for editor preview ───────────────────────────────────
  // Same shared formula as ItemRow and estimates (lib/lineItems.ts) — was
  // its own third independent reimplementation of the same math.
  const editorTotals = calcDocumentTotals(editItems.map(calcLineTotals))

  const visible = invoices.filter(i =>
    filter === 'all' || i.status === filter
  )

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* ── Left: invoice list ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 28px', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 className="lp-page-title">Invoices</h1>
            <p className="lp-page-sub">{visible.length} invoice{visible.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Tab switcher: one-off invoices vs recurring schedules */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {([['invoices', 'invoices' as const, 'Invoices'], ['recurring', 'repeat' as const, 'Recurring']] as const).map(([t, iconName, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5,
              background: tab === t ? 'var(--sem-blue-bg-strong)' : 'transparent',
              color: tab === t ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
              border: 'none', fontWeight: tab === t ? 600 : 400
            }}><Icon name={iconName} size={13} />{label}</button>
          ))}
        </div>

        {tab === 'recurring' && (
          <RecurringInvoicesTab
            orgId={orgId}
            userId={userId}
            clients={clients}
            clientId={scope.clientId ?? null}
          />
        )}

        {/* Invoices tab: filter + table (hidden, not unmounted, on recurring) */}
        <div style={{ display: tab === 'invoices' ? 'contents' : 'none' }}>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['all', 'draft', 'sent', 'partial', 'paid', 'overdue', 'void'] as const).map(s => {
            const active = filter === s
            const cfg    = s !== 'all' ? INVOICE_STATUS_CONFIG[s] : null
            return (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: '5px 12px', borderRadius: 100, fontSize: 12.5, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: active ? 500 : 400,
                background: active ? (cfg?.bg ?? 'rgba(255,255,255,0.08)') : 'transparent',
                color: active ? (cfg?.color ?? 'var(--lp-text)') : 'var(--lp-text-muted)',
                border: active
                  ? `0.5px solid ${cfg?.border ?? 'rgba(255,255,255,0.25)'}`
                  : '0.5px solid var(--lp-border)'
              }}>
                {s === 'all' ? 'All' : INVOICE_STATUS_CONFIG[s].label}
              </button>
            )
          })}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div className="lp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--lp-text-muted)', marginBottom: 12 }}><Icon name="invoices" size={32} strokeWidth={1.3} /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>No invoices yet</div>
            <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginBottom: 20 }}>
              Create your first invoice to start billing clients.
            </div>
            <Button variant="primary" onClick={openCreate}>+ New invoice</Button>
          </div>
        ) : (
          <div className="lp-table-wrap" style={{ flex: 1, overflow: 'auto' }}>
            <table className="lp-table">
              <thead>
                <tr>
                  {['Invoice #', 'Client', 'Issue date', 'Due date', 'Total', 'Balance', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{
                      textAlign: h === 'Total' || h === 'Balance' ? 'right'
                                : h === 'Actions' ? 'center'
                                : 'left'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(inv => {
                  // 🆕 P4 Fase 2.C B2 — Actions business rules:
                  //   · Edit: only draft invoices are editable
                  //   · Void: any non-paid, non-already-void invoice
                  //     (paid invoices must stay for audit trail)
                  const canEdit = inv.status === 'draft'
                  const canVoid = inv.status !== 'paid' && inv.status !== 'void'
                  return (
                  <tr key={inv.id}
                    onClick={() => loadDetail(inv.id)}
                    style={{
                      cursor: 'pointer',
                      background: selected === inv.id ? 'var(--sem-blue-bg)' : 'transparent',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => { if (selected !== inv.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                    onMouseLeave={e => { if (selected !== inv.id) e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--lp-accent)' }}>
                      {inv.invoice_number}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--lp-text)' }}>
                      {inv.clients?.display_name ?? '—'}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>{inv.issue_date}</td>
                    <td style={{
                      fontSize: 12.5,
                      color: inv.status === 'overdue' ? 'var(--sem-red)' : 'var(--lp-text-muted)'
                    }}>
                      {inv.due_date}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 500, color: 'var(--lp-text)' }}>
                      {formatCurrency(inv.total, inv.currency)}
                    </td>
                    <td style={{
                      textAlign: 'right', fontSize: 13, fontWeight: 500,
                      color: inv.balance_due > 0 ? 'var(--sem-amber)' : 'var(--sem-green)'
                    }}>
                      {formatCurrency(inv.balance_due, inv.currency)}
                    </td>
                    <td><StatusBadge status={inv.status} /></td>

                    {/* 🆕 P4 Fase 2.C B2 — Per-row actions */}
                    <td
                      onClick={e => e.stopPropagation()}
                      style={{ textAlign: 'center' }}
                    >
                      <div style={{
                        display: 'inline-flex',
                        gap: 4,
                        alignItems: 'center'
                      }}>
                        <button
                          onClick={() => openChat(inv.client_id)}
                          title="Chat about this invoice"
                          style={{
                            background:   'transparent',
                            border:       '0.5px solid var(--lp-border)',
                            color:        'var(--lp-accent)',
                            borderRadius: 6,
                            padding:      '3px 8px',
                            fontSize:     10.5,
                            cursor:       'pointer',
                            fontFamily:   'inherit'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--chat-bubble-mine-bg)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <Icon name="chat" size={14} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(inv.id) }}
                          disabled={!canEdit}
                          title={canEdit
                            ? 'Open invoice for editing'
                            : 'Only draft invoices can be edited'}
                          style={{
                            background:   'transparent',
                            border:       '0.5px solid var(--lp-border)',
                            color:        canEdit ? 'var(--lp-text)' : 'var(--lp-text-muted)',
                            borderRadius: 6,
                            padding:      '3px 8px',
                            fontSize:     10.5,
                            cursor:       canEdit ? 'pointer' : 'not-allowed',
                            fontFamily:   'inherit',
                            opacity:      canEdit ? 1 : 0.5
                          }}
                          onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = 'var(--lp-surface-2)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <Icon name="edit" size={12} /> Edit
                        </button>
                        <button
                          onClick={() => handleSendLink(inv)}
                          disabled={sendingId === inv.id || inv.status === 'void'}
                          title="Generate & copy the public payment link"
                          style={{
                            background:   'transparent',
                            border:       '0.5px solid var(--lp-border)',
                            color:        linkCopiedId === inv.id ? 'var(--sem-green)' : 'var(--lp-accent)',
                            borderRadius: 6,
                            padding:      '3px 8px',
                            fontSize:     10.5,
                            cursor:       inv.status === 'void' ? 'not-allowed' : 'pointer',
                            fontFamily:   'inherit',
                            opacity:      inv.status === 'void' ? 0.5 : 1,
                            whiteSpace:   'nowrap'
                          }}
                          onMouseEnter={e => { if (inv.status !== 'void') e.currentTarget.style.background = 'var(--lp-surface-2)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          {sendingId === inv.id ? '…' : linkCopiedId === inv.id ? '✓ Copied' : <><Icon name="link" size={12} /> Send link</>}
                        </button>
                        <button
                          onClick={() => handleEmailInvoice(inv)}
                          disabled={emailingId === inv.id || inv.status === 'void' || !inv.clients?.email}
                          title={inv.clients?.email
                            ? `Email the invoice to ${inv.clients.email}`
                            : 'This client has no email address on file'}
                          style={{
                            background:   'transparent',
                            border:       '0.5px solid var(--lp-border)',
                            color:        emailSentId === inv.id ? 'var(--sem-green)' : 'var(--lp-accent)',
                            borderRadius: 6,
                            padding:      '3px 8px',
                            fontSize:     10.5,
                            cursor:       (inv.status === 'void' || !inv.clients?.email) ? 'not-allowed' : 'pointer',
                            fontFamily:   'inherit',
                            opacity:      (inv.status === 'void' || !inv.clients?.email) ? 0.5 : 1,
                            whiteSpace:   'nowrap'
                          }}
                          onMouseEnter={e => { if (inv.status !== 'void' && inv.clients?.email) e.currentTarget.style.background = 'var(--lp-surface-2)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          {emailingId === inv.id ? '…' : emailSentId === inv.id ? '✓ Emailed' : <><Icon name="mail" size={12} /> Email</>}
                        </button>
                        <button
                          onClick={() => handleVoidInvoice(inv)}
                          disabled={!canVoid}
                          title={canVoid
                            ? 'Mark invoice as void (cannot be undone)'
                            : 'Paid or already-void invoices cannot be voided'}
                          style={{
                            background:   'transparent',
                            border:       '0.5px solid var(--lp-border)',
                            color:        canVoid ? 'var(--sem-red)' : 'var(--lp-text-muted)',
                            borderRadius: 6,
                            padding:      '3px 8px',
                            fontSize:     10.5,
                            cursor:       canVoid ? 'pointer' : 'not-allowed',
                            fontFamily:   'inherit',
                            opacity:      canVoid ? 1 : 0.5
                          }}
                          onMouseEnter={e => { if (canVoid) e.currentTarget.style.background = 'var(--sem-red-bg)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          ⊘ Void
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
        </div>{/* end invoices-tab wrapper */}
      </div>

      {/* ── Right: detail panel ────────────────────────────────────────── */}
      {detail && (
        <div style={{
          width: 380, flexShrink: 0, borderLeft: '0.5px solid var(--lp-border)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
          padding: '20px 20px'
        }}>
          {/* Detail header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--lp-accent)', marginBottom: 4 }}>
                {detail.invoice_number}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)' }}>
                {detail.clients?.display_name}
              </div>
              <div style={{ marginTop: 5 }}><StatusBadge status={detail.status} /></div>
            </div>
            <button onClick={() => { setSelected(null); setDetail(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                       color: 'var(--lp-text-muted)', fontSize: 14 }}>✕</button>
          </div>

          {/* Amounts */}
          <div className="lp-card" style={{ marginBottom: 14, padding: '14px 16px' }}>
            {[
              ['Subtotal',  detail.subtotal],
              ['Tax',       detail.tax_total],
              ['Total',     detail.total],
              ['Paid',      detail.amount_paid],
            ].map(([label, val]) => (
              <div key={label as string} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '5px 0',
                borderBottom: label === 'Tax' ? '0.5px solid var(--lp-border)' : 'none',
                borderTop: label === 'Total' ? '0.5px solid var(--lp-border)' : 'none'
              }}>
                <span style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>{label}</span>
                <span style={{
                  fontSize: label === 'Total' ? 15 : 12.5,
                  fontWeight: label === 'Total' ? 700 : 400,
                  color: 'var(--lp-text)'
                }}>
                  {formatCurrency(val as number, detail.currency)}
                </span>
              </div>
            ))}
            {detail.balance_due > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sem-amber)' }}>Balance due</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--sem-amber)' }}>
                  {formatCurrency(detail.balance_due, detail.currency)}
                </span>
              </div>
            )}
          </div>

          {/* How the sales tax was worked out when the invoice was issued (firm only) */}
          {detail.status !== 'draft' && (
            <InvoiceTaxSnapshotCard invoiceId={detail.id} currentTaxTotal={Number(detail.tax_total)} currency={detail.currency} />
          )}

          {/* Line items */}
          {detail.items?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Items
              </div>
              {detail.items.map((item: InvoiceItem) => (
                <div key={item.id} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 8,
                  padding: '7px 0', borderBottom: '0.5px solid var(--lp-border)'
                }}>
                  <div>
                    <div style={{ fontSize: 12.5, color: 'var(--lp-text)' }}>{item.description}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                      {item.quantity} × {formatCurrency(item.unit_price)}
                      {item.tax_rate > 0 && ` + ${item.tax_rate}% tax`}
                    </div>
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>
                    {formatCurrency(item.line_total)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Payments history */}
          {detail.payments?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Payments
              </div>
              {detail.payments.map((p: any) => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '6px 0', borderBottom: '0.5px solid var(--lp-border)'
                }}>
                  <div>
                    <div style={{ fontSize: 12.5, color: 'var(--sem-green)', fontWeight: 500 }}>
                      {formatCurrency(p.amount, detail.currency)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                      {p.payment_date} · {p.method ?? 'other'}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 12 }}>
            <Button variant="ghost" onClick={() => setPrinting(true)}>
              <Icon name="print" size={13} /> Print / Save PDF
            </Button>
            {detail.status !== 'paid' && detail.status !== 'void' && (
              <Button variant="success" onClick={() => setShowPayment(true)}>
                + Record payment
              </Button>
            )}
            {detail.status !== 'void' && (
              <Button variant="ghost" onClick={async () => {
                await voidInvoice(detail.id)
                await load()
                setDetail(null); setSelected(null)
              }}>
                Void invoice
              </Button>
            )}
          </div>

          {/* Print renderer */}
          {printing && detail.clients && (
            <InvoicePrint
              invoice={detail}
              items={detail.items ?? []}
              client={detail.clients as Client}
              orgName={activeOrg?.name ?? 'LedgiProof'}
              branding={branding}
              onClose={() => setPrinting(false)}
            />
          )}
        </div>
      )}

      {/* ── New invoice modal ──────────────────────────────────────────── */}
      <Modal
        open={showEditor}
        onClose={() => setShowEditor(false)}
        title={editorMode === 'edit' ? 'Edit Invoice' : 'New Invoice'}
        width={700}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowEditor(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={!editClientId || !editDueDate}
              onClick={handleSave}
            >
              {editorMode === 'edit' ? 'Save changes' : 'Create invoice'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Client selector */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Client</label>
              <select className="lp-input" value={editClientId} onChange={e => setEditClientId(e.target.value)}>
                <option value="">Select client…</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name}</option>
                ))}
              </select>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowNewClient(true)} style={{ marginBottom: 0 }}>
              + New client
            </Button>
          </div>

          {/* Due date + title */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Due date</label>
              <input type="date" className="lp-input" value={editDueDate}
                onChange={e => setEditDueDate(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Title (optional)</label>
              <input className="lp-input" placeholder="e.g. Bookkeeping services — March 2025"
                value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>Line items</div>
              <button
                onClick={autoFillSalesTax}
                disabled={!editClientId || taxResolving}
                className="lp-btn-outline"
                title="Fill each line's tax % from the client's state sales-tax rate"
              >
                {taxResolving ? 'Resolving…' : <><Icon name="calculator" size={12} /> Auto-fill sales tax</>}
              </button>
            </div>
            {taxNote && (
              <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                {taxNote}
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Description', 'Qty', 'Unit price', 'Disc %', 'Tax %', 'Total', ''].map(h => (
                    <th key={h} style={{
                      fontSize: 10.5, color: 'var(--lp-text-muted)', textAlign: h === 'Total' ? 'right' : 'left',
                      padding: '0 4px 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {editItems.map((item, i) => (
                  <ItemRow key={i} item={item} index={i}
                    onChange={changeItem} onDelete={deleteItem} />
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={addItem} style={{
                flex: 1, background: 'none',
                border: '0.5px dashed var(--lp-border)', borderRadius: 7,
                padding: '6px 14px', cursor: 'pointer', fontSize: 12.5,
                color: 'var(--lp-text-muted)', fontFamily: 'inherit'
              }}>
                + Add line item
              </button>
              {editClientId && (
                <button onClick={pullUnbilledTime} disabled={pullingTime} style={{
                  flex: 1, background: 'none',
                  border: '0.5px dashed var(--lp-accent)', borderRadius: 7,
                  padding: '6px 14px', cursor: pullingTime ? 'default' : 'pointer', fontSize: 12.5,
                  color: 'var(--lp-accent)', fontFamily: 'inherit', opacity: pullingTime ? 0.6 : 1
                }}>
                  {pullingTime ? 'Loading…' : '⏱ Add unbilled time'}
                </button>
              )}
            </div>
          </div>

          {/* Running total */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 20,
            padding: '10px 14px', background: 'rgba(255,255,255,0.03)',
            borderRadius: 8, border: '0.5px solid var(--lp-border)'
          }}>
            {[
              ['Subtotal', editorTotals.subtotal],
              ...(editorTotals.discount_total > 0 ? [['Discount', -editorTotals.discount_total]] as const : []),
              ['Tax', editorTotals.tax_total],
              ['Total', editorTotals.total]
            ].map(([label, val]) => (
              <div key={label as string}>
                <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: label === 'Total' ? 16 : 13, fontWeight: label === 'Total' ? 700 : 400, color: 'var(--lp-text)' }}>
                  {formatCurrency(val as number)}
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Notes (shown on invoice)</label>
            <textarea className="lp-input" rows={2} value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Payment instructions, thank you note, etc."
              style={{ resize: 'none' }} />
          </div>
        </div>
      </Modal>

      {/* ── Record payment modal ───────────────────────────────────────── */}
      <Modal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        title="Record Payment"
        width={400}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowPayment(false)}>Cancel</Button>
            <Button variant="success" loading={payingSaving}
              disabled={!payAmount || parseFloat(payAmount) <= 0}
              onClick={handlePayment}>
              Save payment
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {detail && (
            <div style={{ padding: '10px 14px', borderRadius: 8,
              background: 'var(--sem-amber-bg)', border: '0.5px solid rgba(245,158,11,0.2)',
              fontSize: 13, color: 'var(--sem-amber-soft)' }}>
              Balance due: <strong>{formatCurrency(detail.balance_due, detail.currency)}</strong>
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Amount</label>
            <input type="number" min="0.01" step="0.01" className="lp-input"
              placeholder="0.00" value={payAmount}
              onChange={e => setPayAmount(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Date</label>
              <input type="date" className="lp-input" value={payDate}
                onChange={e => setPayDate(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Method</label>
              <select className="lp-input" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                {['bank_transfer','check','cash','credit_card','stripe','paypal','zelle','other']
                  .map(m => <option key={m} value={m}>{m.replace('_',' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Reference (optional)</label>
            <input className="lp-input" placeholder="Check #, transaction ID…"
              value={payRef} onChange={e => setPayRef(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* ── New client dialog ──────────────────────────────────────────── */}
      <AddClientDialog
        open={showNewClient}
        onClose={() => setShowNewClient(false)}
        orgId={orgId}
        onCreated={handleClientCreated}
      />

    </div>
  )
}
