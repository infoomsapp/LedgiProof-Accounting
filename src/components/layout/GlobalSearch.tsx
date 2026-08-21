// PATH: src/components/layout/GlobalSearch.tsx
// ⌘K / Ctrl+K search bar in the topbar.
// Searches: transactions (description/reference), invoices (number/client),
// clients (name/email), documents (filename) across the active org.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate }  from 'react-router-dom'
import { useScope }     from '../../hooks/useScope'
import { db }           from '../../lib/supabase'
import { formatCurrency } from '../../lib/currency'
import { formatDate }   from '../../lib/dates'

interface SearchResult {
  type:    'transaction' | 'invoice' | 'client' | 'document'
  id:      string
  title:   string
  sub:     string
  icon:    string
  path:    string
}

// Sanitizes a search term for safe use inside a PostgREST .ilike()/.or() filter
// string built via template literal. Two distinct hazards:
//   - "," "(" ")" "." are PostgREST filter-grammar separators — there's no
//     reliable backslash-escape for them inside a manually-built .or() string,
//     so they're stripped outright (harmless for a free-text search query).
//   - "%" "_" are LIKE wildcards — backslash-escaped so literal % or _ in a
//     search term isn't treated as a wildcard (Postgres's default LIKE escape
//     character is backslash).
function escapePostgrestLike(s: string): string {
  return s.replace(/[,().]/g, '').replace(/[\\%_]/g, '\\$&')
}

function highlight(text: string, query: string): string {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '**$1**')
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} style={{ background: 'rgba(59,130,246,0.25)', color: '#93c5fd',
              borderRadius: 2, padding: '0 1px' }}>{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

export default function GlobalSearch() {
  // scope.orgId falls back through activeOrg too, unlike membership?.org_id
  // alone — that was the actual bug here: if membership was ever null/stale
  // (the same class of issue already fixed on Transactions/BankImports/
  // Reconciliation this session), orgId silently resolved to '', the early
  // `!orgId` guard below fired on every keystroke, and search always
  // returned zero results with no visible error — reading as "doesn't work."
  const scope             = useScope()
  const orgId             = scope.orgId
  const navigate          = useNavigate()

  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active,  setActive]  = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout>>()

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50) }
    else       { setQuery(''); setResults([]) }
  }, [open])

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (!orgId || q.trim().length < 2) { setResults([]); return }
    setLoading(true)

    const term = `%${escapePostgrestLike(q.trim())}%`

    const [txRes, invRes, clientRes, docRes] = await Promise.all([
      db.from('transactions').select('id, description, reference, amount, currency, transaction_date, semaphore')
        .eq('org_id', orgId).eq('is_current', true)
        .or(`description.ilike.${term},reference.ilike.${term}`)
        .limit(5),

      db.from('invoices').select('id, invoice_number, total, currency, status, clients(display_name)')
        .eq('org_id', orgId)
        .or(`invoice_number.ilike.${term}`)
        .limit(5),

      db.from('clients').select('id, display_name, company_name, email')
        .eq('org_id', orgId).eq('is_active', true)
        .or(`display_name.ilike.${term},company_name.ilike.${term},email.ilike.${term}`)
        .limit(5),

      db.from('documents').select('id, filename, client_id, created_at, clients(display_name, company_name)')
        .eq('org_id', orgId).is('deleted_at', null)
        .ilike('filename', term)
        .limit(5)
    ])

    const combined: SearchResult[] = [
      ...(txRes.data ?? []).map((r: any) => ({
        type:  'transaction' as const,
        id:    r.id,
        title: r.description ?? r.reference ?? 'Transaction',
        sub:   `${r.transaction_date} · ${formatCurrency(r.amount, r.currency)}`,
        icon:  r.semaphore === 'red' ? '🔴' : r.semaphore === 'amber' ? '🟡' : r.semaphore === 'blue' ? '🔵' : '🟢',
        path:  '/transactions'
      })),
      ...(invRes.data ?? []).map((r: any) => ({
        type:  'invoice' as const,
        id:    r.id,
        title: r.invoice_number,
        sub:   `${(r.clients as any)?.display_name ?? ''} · ${formatCurrency(r.total, r.currency)}`,
        icon:  '🧾',
        path:  '/invoices'
      })),
      ...(clientRes.data ?? []).map((r: any) => ({
        type:  'client' as const,
        id:    r.id,
        title: r.display_name,
        sub:   r.company_name ?? r.email ?? '',
        icon:  '🧑‍💼',
        path:  '/clients'
      })),
      ...(docRes.data ?? []).map((r: any) => ({
        type:  'document' as const,
        id:    r.id,
        title: r.filename,
        sub:   `${(r.clients as any)?.company_name ?? (r.clients as any)?.display_name ?? 'Firm'} · ${formatDate(r.created_at)}`,
        icon:  '📎',
        path:  r.client_id ? `/clients/${r.client_id}` : '/clients'
      }))
    ]

    setResults(combined)
    setActive(0)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(query), 250)
    return () => clearTimeout(timerRef.current)
  }, [query, search])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && results[active]) {
      navigate(results[active].path)
      setOpen(false)
    }
  }

  function handleSelect(r: SearchResult) {
    navigate(r.path)
    setOpen(false)
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
          background: 'rgba(255,255,255,0.05)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          color: '#64748b', fontFamily: 'inherit', fontSize: 12.5,
          transition: 'all 0.15s', minWidth: 180
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <span>Search…</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>⌘K</span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: 80
          }}
        >
          <div style={{
            width: 560, background: '#1c2235',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 14, overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)'
          }}>
            {/* Search input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search transactions, invoices, clients, documents…"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: 'var(--lp-text)', fontSize: 14, fontFamily: 'inherit'
                }}
              />
              {loading && (
                <span style={{
                  width: 13, height: 13,
                  border: '1.5px solid rgba(59,130,246,0.3)', borderTopColor: '#3b82f6',
                  borderRadius: '50%', animation: 'lp-spin 0.6s linear infinite',
                  display: 'inline-block', flexShrink: 0
                }} />
              )}
              <kbd style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 5,
                background: 'rgba(255,255,255,0.07)', color: '#64748b',
                border: '0.5px solid rgba(255,255,255,0.1)', fontFamily: 'inherit'
              }}>ESC</kbd>
            </div>

            {/* Results */}
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {query.trim().length < 2 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                  <div style={{ fontSize: 13, color: '#475569' }}>
                    Type at least 2 characters to search
                  </div>
                </div>
              ) : results.length === 0 && !loading ? (
                <div style={{ padding: '24px 16px', textAlign: 'center',
                  fontSize: 13, color: '#475569' }}>
                  No results for "<strong style={{ color: '#64748b' }}>{query}</strong>"
                </div>
              ) : (
                <>
                  {results.map((r, i) => (
                    <button
                      key={r.id}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setActive(i)}
                      style={{
                        width: '100%', background: i === active
                          ? 'rgba(59,130,246,0.1)' : 'none',
                        border: 'none', borderBottom: '0.5px solid rgba(255,255,255,0.05)',
                        padding: '10px 16px', textAlign: 'left', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12,
                        transition: 'background 0.08s'
                      }}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--lp-text)', marginBottom: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <HighlightText text={r.title} query={query} />
                        </div>
                        <div style={{ fontSize: 11.5, color: '#475569',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.sub}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 100,
                        color: '#475569', background: 'rgba(255,255,255,0.05)',
                        border: '0.5px solid rgba(255,255,255,0.08)',
                        textTransform: 'capitalize', flexShrink: 0
                      }}>
                        {r.type}
                      </span>
                    </button>
                  ))}
                  <div style={{ padding: '8px 16px', fontSize: 11, color: '#334155',
                    display: 'flex', gap: 12 }}>
                    <span>↑↓ Navigate</span>
                    <span>↵ Open</span>
                    <span>ESC Close</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes lp-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}