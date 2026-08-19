// PATH: src/components/dashboard/v2/bookkeeper/ClientsWithIssuesPanel.tsx
// Top 5 clients with red/amber transactions.
// Click → "View as" that client.

import { useImpersonationStore } from '../../../../store/impersonation.store'
import { useNavigate } from 'react-router-dom'
import type { ClientWithIssues } from '../../../../services/bookkeeper-dashboard.service'

export default function ClientsWithIssuesPanel({ clients }: { clients: ClientWithIssues[] }) {
  const enterAdminView = useImpersonationStore(s => s.enterAdminView)
  const navigate = useNavigate()

  function viewAs(c: ClientWithIssues) {
    enterAdminView({
      targetClientId:   c.client_id,
      targetClientName: c.client_name
    })
    navigate('/client')
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 10, fontWeight: 600
      }}>
        Clients needing attention
        <span style={{
          textTransform: 'none', letterSpacing: 0,
          fontWeight: 400, color: 'var(--lp-text-muted)', marginLeft: 8
        }}>
          · Top 5 by issue count
        </span>
      </div>

      <div style={{
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        borderRadius: 10,
        overflow: 'hidden'
      }}>
        {clients.length === 0 ? (
          <div style={{
            padding: '28px 14px', fontSize: 12.5, color: 'var(--lp-text-muted)',
            textAlign: 'center', fontStyle: 'italic'
          }}>
            ✓ No clients with red flags — all clean
          </div>
        ) : (
          clients.map((c, i) => (
            <button
              key={c.client_id}
              onClick={() => viewAs(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', textAlign: 'left',
                padding: '11px 14px',
                borderBottom: i < clients.length - 1 ? '0.5px solid var(--lp-border)' : 'none',
                background: 'transparent', border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.12s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--sem-red-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Rank */}
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--sem-red-bg)',
                border: '0.5px solid var(--sem-red-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: 'var(--sem-red)', flexShrink: 0
              }}>
                {i + 1}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, color: 'var(--lp-text)', fontWeight: 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  marginBottom: 2
                }}>
                  {c.client_name}
                </div>
                {c.client_email && (
                  <div style={{
                    fontSize: 11, fontFamily: 'monospace', color: 'var(--lp-text-muted)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>
                    {c.client_email}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {c.red_count > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--sem-red)',
                    padding: '2px 8px', borderRadius: 100,
                    background: 'var(--sem-red-bg)',
                    border: '0.5px solid var(--sem-red-border)'
                  }}>
                    {c.red_count} 🔴
                  </span>
                )}
                {c.amber_count > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--sem-amber)',
                    padding: '2px 8px', borderRadius: 100,
                    background: 'var(--sem-amber-bg)',
                    border: '0.5px solid var(--sem-amber-border)'
                  }}>
                    {c.amber_count} 🟡
                  </span>
                )}
                <span style={{
                  fontSize: 10.5, color: 'var(--lp-violet)',
                  padding: '2px 8px', borderRadius: 100,
                  background: 'var(--lp-violet-bg)',
                  border: '0.5px solid var(--lp-violet-border)',
                  fontWeight: 500
                }}>
                  View as →
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
