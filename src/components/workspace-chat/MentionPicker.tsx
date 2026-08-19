// PATH: src/components/workspace-chat/MentionPicker.tsx
// Floating member-suggestion picker that appears when the composer detects @query.
// Fetch is lazy and cached within the component lifetime.

import { useState, useEffect, useRef, useCallback } from 'react'
import { db }                                        from '../../lib/supabase'

export interface OrgMember {
  id:           string
  display_name: string
  lp_user_code: string
}

interface Props {
  orgId:    string
  query:    string           // text typed after @
  onSelect: (name: string) => void
  onClose:  () => void
}

export default function MentionPicker({ orgId, query, onSelect, onClose }: Props) {
  const [members,  setMembers]  = useState<OrgMember[]>([])
  const [active,   setActive]   = useState(0)
  const fetchedOrg  = useRef<string | null>(null)
  const onCloseRef  = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // Fetch members once per orgId
  useEffect(() => {
    if (fetchedOrg.current === orgId) return
    fetchedOrg.current = orgId

    db.from('organization_memberships')
      .select('user_id, profiles(display_name, lp_user_code)')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .then(({ data }) => {
        const rows: OrgMember[] = (data ?? []).flatMap((r: any) => {
          const p = r.profiles
          if (!p || !p.display_name) return []
          return [{ id: r.user_id, display_name: p.display_name, lp_user_code: p.lp_user_code }]
        })
        setMembers(rows)
      })
  }, [orgId])

  const filtered = members.filter(m =>
    m.display_name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8)

  // Reset active index when results change
  useEffect(() => { setActive(0) }, [query])

  // Auto-close when members have loaded but none match — unblocks Enter key
  useEffect(() => {
    if (members.length > 0 && filtered.length === 0) onCloseRef.current()
  }, [members.length, filtered.length])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      onSelect(filtered[active]?.display_name ?? '')
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [filtered, active, onSelect, onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (filtered.length === 0) return null

  return (
    <div style={{
      position:  'absolute',
      bottom:    '100%',
      left:      0,
      right:     0,
      marginBottom: 4,
      background: 'var(--lp-surface)',
      border:     '0.5px solid var(--lp-border)',
      borderRadius: 8,
      boxShadow:  '0 4px 18px rgba(0,0,0,0.18)',
      overflow:   'hidden',
      zIndex:     900,
    }}>
      <div style={{
        padding:    '5px 10px',
        fontSize:   10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        color:      'var(--lp-text-muted)',
        borderBottom: '0.5px solid var(--lp-border)',
      }}>
        Team members
      </div>
      {filtered.map((m, i) => (
        <button
          key={m.id}
          onClick={() => onSelect(m.display_name)}
          style={{
            width: '100%', textAlign: 'left', padding: '7px 12px',
            background: i === active ? 'var(--lp-surface-2)' : 'transparent',
            border: 'none', borderBottom: i < filtered.length - 1 ? '0.5px solid var(--lp-border)' : 'none',
            color: 'var(--lp-text)', fontSize: 12.5, cursor: 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
          }}
          onMouseEnter={() => setActive(i)}
        >
          <span style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(167,139,250,0.18)',
            color: 'var(--lp-accent)', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {m.display_name.charAt(0).toUpperCase()}
          </span>
          <span style={{ flex: 1, fontWeight: 500 }}>{m.display_name}</span>
          {m.lp_user_code && (
            <span style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {m.lp_user_code}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Helpers (exported for use in WorkspaceChatPanel) ─────────────────────────

/** Returns the query text after the last mention-triggering @, or null if not in a mention. */
export function getMentionQuery(value: string, cursorPos: number): string | null {
  const textUpTo = value.slice(0, cursorPos)
  const lastAt   = textUpTo.lastIndexOf('@')
  if (lastAt === -1) return null
  // @ must be at start of text or preceded by whitespace
  if (lastAt > 0 && !/\s/.test(textUpTo[lastAt - 1] ?? '')) return null
  const query = textUpTo.slice(lastAt + 1)
  if (query.includes('\n')) return null
  return query
}

/** Splices a selected member name into the draft, replacing the @query. */
export function insertMention(draft: string, cursorPos: number, memberName: string): { text: string; cursor: number } {
  const before  = draft.slice(0, cursorPos)
  const after   = draft.slice(cursorPos)
  const lastAt  = before.lastIndexOf('@')
  const prefix  = lastAt >= 0 ? before.slice(0, lastAt) : before
  const inserted = `@${memberName} `
  return { text: prefix + inserted + after, cursor: prefix.length + inserted.length }
}
