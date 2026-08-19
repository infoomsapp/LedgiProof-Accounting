// PATH: src/pages/Unauthorized.tsx
//
// Shown when a user navigates to a route their UserKind isn't allowed to access.
// Used as the `redirectTo` target of <RoleGuard>.
//
// Avoids leaking which roles WOULD have access — just tells the user they
// don't have access and offers two recovery actions.

import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useUserRole }  from '../hooks/useUserRole'
import LogoBrand from '../components/ui/LogoBrand'

export default function Unauthorized() {
  const navigate    = useNavigate()
  const { signOut } = useAuthStore()
  const role        = useUserRole()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 16
    }}>
      <div style={{ marginBottom: 8 }}>
        <LogoBrand variant="full" />
      </div>

      <div style={{
        maxWidth: 460,
        textAlign: 'center',
        padding: '36px 28px',
        borderRadius: 14,
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)'
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>

        <h1 style={{
          fontSize: 18, fontWeight: 700, color: 'var(--lp-text)',
          margin: 0, marginBottom: 8,
          letterSpacing: '-0.01em'
        }}>
          You don't have access to this section
        </h1>

        <p style={{
          fontSize: 13, color: 'var(--lp-text-muted)',
          margin: 0, marginBottom: 6, lineHeight: 1.55
        }}>
          Your account doesn't have permission to view that page. If you think
          this is a mistake, contact your workspace administrator.
        </p>

        {!role.loading && role.kind !== 'unknown' && (
          <p style={{
            fontSize: 11, color: '#475569',
            margin: 0, marginBottom: 24, fontStyle: 'italic'
          }}>
            Logged in as <strong style={{ color: 'var(--lp-text-muted)' }}>{role.kind.replace('_', ' ')}</strong>
          </p>
        )}

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap',
          marginTop: 20
        }}>
          <button
            onClick={() => navigate('/', { replace: true })}
            style={{
              padding: '9px 18px', borderRadius: 8,
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              border: 'none',
              color: '#fff',
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            ↶ Back to dashboard
          </button>

          <button
            onClick={() => signOut()}
            style={{
              padding: '9px 18px', borderRadius: 8,
              background: 'transparent',
              border: '0.5px solid var(--lp-border)',
              color: 'var(--lp-text-muted)',
              fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <p style={{
        fontSize: 11.5, color: '#475569', marginTop: 8
      }}>
        LedgiProof · Olympus Mont Systems LLC
      </p>
    </div>
  )
}