// PATH: src/components/admin/QuickSearchPalette.tsx
// ⌘K command palette for super admins.
// Opens with Cmd+K / Ctrl+K, searches orgs + users, lets you "View as" instantly.

import { useEffect, useRef, useState } from 'react'
import { useViewAs } from '../../hooks/useViewAs'
import {
  searchAdminEntities,
  type SearchResults,
  type SearchResultOrg,
  type SearchResultUser
} from '../../services/admin-command.service'

interface Props {
  open:    boolean
  onClose: () => void
}

const SEARCH_DEBOUNCE_MS = 180

export default function QuickSearchPalette({ open, onClose }: Props) {
  const { viewAsOrg, viewAsUser } = useViewAs()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<SearchResults>({ organizations: [], users: [] })
  const [loading,  setLoading]  = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)

  // Flat list of items for keyboard navigation
  type Item =
    | { kind: 'org';  data: SearchResultOrg }
    | { kind: 'user'; data: SearchResultUser }

  const items: Item[] = [
    ...results.organizations.map(o => ({ kind: 'org' as const,  data: o })),
    ...results.users.map(u =>         ({ kind: 'user' as const, data: u }))
  ]

  // Reset on open + autofocus
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults({ organizations: [], users: [] })
      setActiveIdx(0)
      // Focus after render
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length < 1) {
      setResults({ organizations: [], users: [] })
      setLoading(false)
      return
    }

    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await searchAdminEntities(trimmed, 8)
        setResults(r)
        setActiveIdx(0)
      } catch (err) {
        console.warn('[QuickSearch]', err)
      } finally {
        setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query, open])

  // Keyboard handling
  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => Math.min(items.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[activeIdx]
        if (item) handleSelect(item)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items, activeIdx, onClose])

  async function handleSelect(item: Item) {
    onClose()
    try {
      if (item.kind === 'org') {
        await viewAsOrg(item.data.id)
      } else {
        // Never falls back to email — super_admin identifies people via
        // lp_user_code, not their login email.
        await viewAsUser(item.data.id, item.data.display_name ?? item.data.lp_user_code)
      }
    } catch (err) {
      // View As lookup failed (org/user not found, no active membership, etc.)
      // — surface it rather than silently navigating into a broken state.
      alert(err instanceof Error ? err.message : 'Failed to enter View As mode')
    }
  }

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2500,
        background: 'rgba(2, 6, 23, 0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(620px, 92%)',
          background: '#0f172a',
          border: '0.5px solid rgba(148, 163, 184, 0.2)',
          borderRadius: 14,
          boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px',
          borderBottom: '0.5px solid rgba(148, 163, 184, 0.15)'
        }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search organizations, users, LP codes…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#e2e8f0',
              fontSize: 15,
              fontFamily: 'inherit'
            }}
          />
          <kbd style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 5,
            background: 'rgba(148, 163, 184, 0.1)',
            border: '0.5px solid rgba(148, 163, 184, 0.2)',
            color: '#94a3b8',
            fontFamily: 'inherit'
          }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>

          {loading && (
            <div style={{
              padding: '20px 18px', fontSize: 12, color: '#64748b',
              textAlign: 'center'
            }}>
              Searching…
            </div>
          )}

          {!loading && query.trim().length === 0 && (
            <Hints />
          )}

          {!loading && query.trim().length > 0 && items.length === 0 && (
            <div style={{
              padding: '24px 18px', fontSize: 13, color: '#64748b',
              textAlign: 'center'
            }}>
              No results for "{query.trim()}"
            </div>
          )}

          {!loading && results.organizations.length > 0 && (
            <SectionHeader>Organizations · {results.organizations.length}</SectionHeader>
          )}
          {!loading && results.organizations.map((o, i) => (
            <OrgRow
              key={o.id}
              org={o}
              active={items[activeIdx]?.kind === 'org' && items[activeIdx].data.id === o.id}
              onClick={() => handleSelect({ kind: 'org', data: o })}
            />
          ))}

          {!loading && results.users.length > 0 && (
            <SectionHeader>Users · {results.users.length}</SectionHeader>
          )}
          {!loading && results.users.map((u, i) => (
            <UserRow
              key={u.id}
              user={u}
              active={items[activeIdx]?.kind === 'user' && items[activeIdx].data.id === u.id}
              onClick={() => handleSelect({ kind: 'user', data: u })}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 18px',
          borderTop: '0.5px solid rgba(148, 163, 184, 0.15)',
          display: 'flex', gap: 16, fontSize: 10.5, color: '#64748b'
        }}>
          <KbdHint kbd="↑↓" label="navigate" />
          <KbdHint kbd="↵"  label="view as"  />
          <KbdHint kbd="esc" label="close"   />
          <span style={{ marginLeft: 'auto', color: '#475569' }}>
            All view-as actions are logged
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 18px 4px',
      fontSize: 10, color: '#64748b', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.08em'
    }}>
      {children}
    </div>
  )
}

function OrgRow({
  org, active, onClick
}: {
  org: SearchResultOrg
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', textAlign: 'left',
        padding: '10px 18px',
        background: active ? 'rgba(59,130,246,0.10)' : 'transparent',
        borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit'
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: 'rgba(34, 197, 94, 0.15)',
        border: '0.5px solid rgba(34, 197, 94, 0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, flexShrink: 0
      }}>
        🏢
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, color: '#e2e8f0', fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {org.name}
        </div>
        <div style={{
          fontSize: 10.5, fontFamily: 'monospace', color: '#64748b',
          marginTop: 1
        }}>
          {org.slug} {org.currency && `· ${org.currency}`}
          {!org.is_active && (
            <span style={{ color: '#ef4444', marginLeft: 8 }}>· inactive</span>
          )}
        </div>
      </div>
      <span style={{
        fontSize: 10.5, padding: '2px 8px', borderRadius: 100,
        background: 'rgba(59,130,246,0.10)',
        color: '#3b82f6', fontWeight: 500,
        border: '0.5px solid rgba(59,130,246,0.25)'
      }}>
        View as →
      </span>
    </button>
  )
}

function UserRow({
  user, active, onClick
}: {
  user: SearchResultUser
  active: boolean
  onClick: () => void
}) {
  const roleColor =
    user.system_role === 'super_admin' ? '#ef4444' :
    user.system_role === 'admin'       ? '#f59e0b' :
    user.system_role === 'bookkeeper'  ? '#3b82f6' :
    user.system_role === 'auditor'     ? '#22c55e' :
                                          '#a78bfa'

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', textAlign: 'left',
        padding: '10px 18px',
        background: active ? 'rgba(167,139,250,0.10)' : 'transparent',
        borderLeft: active ? '2px solid #a78bfa' : '2px solid transparent',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit'
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'rgba(167, 139, 250, 0.15)',
        border: '0.5px solid rgba(167, 139, 250, 0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: '#a78bfa', flexShrink: 0
      }}>
        {(user.display_name ?? user.lp_user_code ?? '?')[0]?.toUpperCase() ?? '?'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, color: '#e2e8f0', fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {user.display_name ?? user.lp_user_code ?? 'Unknown user'}
        </div>
        <div style={{
          fontSize: 10.5, color: '#64748b', marginTop: 1,
          display: 'flex', gap: 8, alignItems: 'center'
        }}>
          {/* Never render email here — super_admin sees the LP code, not the login email */}
          {user.lp_user_code && (
            <span style={{ fontFamily: 'monospace', color: '#475569' }}>
              {user.lp_user_code}
            </span>
          )}
        </div>
      </div>
      {user.system_role && (
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 100,
          background: `${roleColor}18`,
          color: roleColor, fontWeight: 600,
          border: `0.5px solid ${roleColor}40`,
          textTransform: 'uppercase', letterSpacing: '0.04em'
        }}>
          {user.system_role}
        </span>
      )}
    </button>
  )
}

function Hints() {
  return (
    <div style={{ padding: '20px 18px' }}>
      <div style={{
        fontSize: 11, color: '#475569', marginBottom: 14,
        fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em'
      }}>
        Quick tips
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: '#94a3b8' }}>
        <div>🔍 Type an organization name, slug, LP code — email also matches but is never shown</div>
        <div>↵ Press Enter on a result to <strong style={{ color: '#3b82f6' }}>View as</strong> instantly</div>
        <div>👁️ All view-as actions are logged to <code style={{ color: '#64748b' }}>impersonation_audit</code></div>
      </div>
    </div>
  )
}

function KbdHint({ kbd, label }: { kbd: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <kbd style={{
  
        fontSize: 9.5, padding: '1px 5px', borderRadius: 3,
        background: 'rgba(148, 163, 184, 0.1)',
        border: '0.5px solid rgba(148, 163, 184, 0.2)',
        color: '#94a3b8',
        fontFamily: 'inherit'
      }}>
        {kbd}
      </kbd>
      <span>{label}</span>
    </span>
  )
}