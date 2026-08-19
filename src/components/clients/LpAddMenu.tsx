// PATH: src/components/clients/LpAddMenu.tsx
//
// P4 — "+ LP add ▼" split-button menu.
//
// AL's decision: Option A (single button + dropdown) instead of 3 separate
// buttons in the header. Avoids the cognitive load of 3 same-weight primary
// buttons, scales cleanly when future quick-actions are added.
//
// Name "LP add" was chosen explicitly over "Quick add" to avoid being mistaken
// for a QuickBooks clone (AL's pedido).
//
// Actions (in order of frequency for a bookkeeper):
//   1. + Add Client     → opens AddClientDialog inline
//   2. + Estimate       → navigates to /estimates
//   3. ↑ Import Data    → navigates to /import (P-Import.A real wizard)

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AddClientDialog from './AddClientDialog'
import UpgradeModal from '../billing/UpgradeModal'
import { usePlan } from '../../hooks/usePlan'

interface Props {
  orgId:  string
  /** Called when a client is created via the menu (refresh dashboards) */
  onClientCreated?: (clientId: string) => void
}

export default function LpAddMenu({ orgId, onClientCreated }: Props) {
  const navigate = useNavigate()
  const [open,             setOpen]             = useState(false)
  const [addClientOpen,    setAddClientOpen]    = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Sprint B3.5 — tier-aware client creation
  const plan              = usePlan()
  const clientsLimit      = plan.getLimit('clients')      // 0=disabled, -1=unlimited, else quota
  const clientsUsed       = plan.getUsed('clients')
  const clientsRemaining  = plan.getRemaining('clients')  // 0 when exhausted

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function handleAddClient() {
    setOpen(false)
    // Sprint B3.5 gate DESACTIVADO — AL en modo prueba.
    // Restaurar cuando termine refinement.
    setAddClientOpen(true)
  }

  function handleEstimate() {
    setOpen(false)
    // 🆕 B3.7 — Estimate requires a client. Send the bookkeeper to /clients
    // with intent=estimate; Clients.tsx shows a banner + "→ Estimate" buttons.
    navigate('/clients?intent=estimate')
  }

  function handleImport() {
    setOpen(false)
    // 🆕 B3.7 — Import landing decides next step (banner + suggested clients
    // or "Select existing client" CTA). Wizard pages read ?clientId from URL.
    navigate('/import')
  }

  return (
    <>
      <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display:       'inline-flex',
            alignItems:    'center',
            gap:           6,
            padding:       '7px 14px',
            borderRadius:  8,
            background:    'var(--lp-accent)',
            border:        '0.5px solid var(--lp-accent)',
            color:         '#fff',
            fontSize:      12,
            fontWeight:    600,
            fontFamily:    'inherit',
            cursor:        'pointer',
            transition:    'opacity 0.12s',
            whiteSpace:    'nowrap'
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          <span style={{ fontSize: 13 }}>+</span>
          <span>LP add</span>
          <span style={{
            fontSize:  9,
            opacity:   0.85,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s'
          }}>
            ▼
          </span>
        </button>

        {open && (
          <div style={{
            position:     'absolute',
            top:          '100%',
            right:        0,
            marginTop:    4,
            minWidth:     220,
            background:   'var(--lp-surface)',
            border:       '0.5px solid var(--lp-border)',
            borderRadius: 10,
            boxShadow:    '0 8px 24px rgba(0,0,0,0.4)',
            zIndex:       100,
            overflow:     'hidden',
            padding:      '4px 0'
          }}>
            <MenuItem
              icon="👥"
              label="Add Client"
              hint="Create a new billing client"
              onClick={handleAddClient}
            />
            <MenuItem
              icon="📝"
              label="Estimate"
              hint="Send a proposal to a client"
              onClick={handleEstimate}
            />
            <div style={{ borderTop: '0.5px solid var(--lp-border)', margin: '4px 0' }} />
            <MenuItem
              icon="📥"
              label="Import Data"
              hint="Migrate books from QBO, Xero, CSV"
              onClick={handleImport}
            />
          </div>
        )}
      </div>

      {/* Modals — rendered as siblings, not children, to avoid z-index issues */}
      <AddClientDialog
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        orgId={orgId}
        onCreated={(clientId) => {
          setAddClientOpen(false)
          onClientCreated?.(clientId)
        }}
      />

      {/* Sprint B3.5 — Upgrade modal when client limit reached */}
      <UpgradeModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        feature="clients"
        currentPlan={plan.plan}
        reason={clientsLimit === 0 ? 'feature_disabled' : 'limit_exhausted'}
        used={clientsUsed}
        limit={clientsLimit}
      />
    </>
  )
}

// ── Menu item ───────────────────────────────────────────────────────────────

function MenuItem({
  icon, label, hint, onClick
}: {
  icon:    string
  label:   string
  hint:    string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width:         '100%',
        background:    'none',
        border:        'none',
        padding:       '9px 14px',
        cursor:        'pointer',
        textAlign:     'left',
        display:       'flex',
        alignItems:    'center',
        gap:           12,
        transition:    'background 0.1s',
        fontFamily:    'inherit'
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--chat-row-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      <span style={{
        width:        28,
        height:       28,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        fontSize:     14,
        borderRadius: 6,
        background:   'var(--lp-surface-2)',
        flexShrink:   0
      }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:   13,
          fontWeight: 500,
          color:      'var(--lp-text)'
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 11,
          color:    'var(--lp-text-muted)',
          marginTop: 1
        }}>
          {hint}
        </div>
      </div>
    </button>
  )
}