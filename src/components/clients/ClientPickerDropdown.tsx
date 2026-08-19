// PATH: src/components/clients/ClientPickerDropdown.tsx
//
// Sprint 5 Paso 5.4 — Reusable client picker dropdown with search.
//
// REPLACES the "paste UUID" pattern from Sprint 5.3 LegacyAssign modal.
// Lists active clients of the org with local search filter (display_name +
// company_name + email).
//
// USAGE:
//   <ClientPickerDropdown
//     orgId={orgId}
//     selectedId={clientId}
//     onSelect={setClientId}
//     placeholder="Search clients…"
//     excludeIds={['some-id-to-skip']}    // optional
//   />

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getClients } from '../../services/invoice.service'
import type { Client } from '../../types/database.types'

interface Props {
  orgId:        string
  selectedId:   string
  onSelect:     (clientId: string, client: Client | null) => void
  placeholder?: string
  /** Exclude specific client ids (e.g. when picking a "target other than current"). */
  excludeIds?:  string[]
  /** Disable input + dropdown. */
  disabled?:    boolean
  /** Label rendered above. Default: "Client". */
  label?:       string
  /** Help text below. */
  helpText?:    string
}

export default function ClientPickerDropdown({
  orgId,
  selectedId,
  onSelect,
  placeholder = 'Search clients…',
  excludeIds  = [],
  disabled    = false,
  label       = 'Client',
  helpText
}: Props) {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)

  // Fetch active clients (cached for 5 minutes)
  const clientsQ = useQuery({
    queryKey: ['clients', orgId, 'picker'],
    queryFn:  () => getClients(orgId),
    enabled:  !!orgId,
    staleTime: 5 * 60_000
  })

  const allClients = clientsQ.data ?? []

  // Find currently-selected to show name in collapsed state
  const selectedClient = useMemo(() =>
    allClients.find(c => c.id === selectedId) ?? null,
    [allClients, selectedId]
  )

  // Filtered list: by search term + excluded ids
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const excluded = new Set(excludeIds)
    return allClients.filter(c => {
      if (excluded.has(c.id)) return false
      if (!q) return true
      const haystack = [
        c.display_name,
        c.company_name ?? '',
        c.email        ?? ''
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [allClients, search, excludeIds])

  function handlePick(c: Client) {
    onSelect(c.id, c)
    setSearch('')
    setOpen(false)
  }

  function handleClear() {
    onSelect('', null)
    setSearch('')
    setOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      <label style={{
        fontSize: 12, color: 'var(--lp-text-muted)', fontWeight: 600
      }}>
        {label}
      </label>

      {/* Selected display OR search input */}
      {selectedClient && !open ? (
        <button
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 10px', borderRadius: 7,
            background: 'var(--lp-muted-bg)',
            border: '0.5px solid var(--lp-border)',
            color: 'var(--lp-text)', fontSize: 12,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', textAlign: 'left'
          }}
        >
          <span>
            <strong>{selectedClient.display_name}</strong>
            {selectedClient.company_name && (
              <span style={{ color: 'var(--lp-text-muted)', marginLeft: 8 }}>
                · {selectedClient.company_name}
              </span>
            )}
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation()
              if (!disabled) handleClear()
            }}
            style={{
              fontSize: 16, color: 'var(--lp-text-muted)',
              padding: '0 4px', cursor: 'pointer'
            }}
            title="Clear"
          >
            ×
          </span>
        </button>
      ) : (
        <input
          className="lp-input"
          placeholder={placeholder}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          disabled={disabled || clientsQ.isLoading}
          autoFocus={false}
        />
      )}

      {/* Dropdown */}
      {open && !disabled && (
        <div style={{
          position: 'absolute', top: 60, left: 0, right: 0,
          maxHeight: 240, overflowY: 'auto',
          background: 'var(--lp-bg)',
          border: '0.5px solid var(--lp-border)',
          borderRadius: 8,
          boxShadow: 'var(--lp-shadow-md)',
          zIndex: 20
        }}>
          {clientsQ.isLoading && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--lp-text-muted)' }}>
              Loading clients…
            </div>
          )}

          {clientsQ.isError && (
            <div style={{
              padding: 12, fontSize: 12, color: 'var(--sem-red)',
              background: 'var(--sem-red-bg)'
            }}>
              Could not load clients.
            </div>
          )}

          {!clientsQ.isLoading && filtered.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--lp-text-muted)' }}>
              {search ? 'No clients match your search.' : 'No clients available.'}
            </div>
          )}

          {filtered.map(c => (
            <div
              key={c.id}
              onClick={() => handlePick(c)}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                borderBottom: '0.5px solid var(--lp-border)',
                display: 'flex', alignItems: 'baseline', gap: 8
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--lp-muted-bg)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <strong style={{ color: 'var(--lp-text)' }}>{c.display_name}</strong>
              {c.company_name && (
                <span style={{ color: 'var(--lp-text-muted)' }}>
                  {c.company_name}
                </span>
              )}
              {c.email && (
                <span style={{
                  color: 'var(--lp-text-muted)', marginLeft: 'auto', fontSize: 11
                }}>
                  {c.email}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Click-outside close (rendered as overlay below dropdown) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 19, background: 'transparent'
          }}
        />
      )}

      {helpText && (
        <p style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 4 }}>
          {helpText}
        </p>
      )}
    </div>
  )
}