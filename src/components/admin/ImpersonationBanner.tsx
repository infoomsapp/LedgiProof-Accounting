// PATH: src/components/admin/ImpersonationBanner.tsx
// Always-visible banner shown when super admin is in "View as" mode.
// Critical UX rule: NEVER hide this. Prevents human errors.
//
// Defense-in-depth: this banner only renders if the user is genuinely a
// super_admin (via auth store profile.system_role) AND impersonation is active.
// This prevents stale sessionStorage from showing the banner to a non-admin.

import { useImpersonationStore } from '../../store/impersonation.store'
import { useAuthStore }          from '../../store/auth.store'
import { useViewAs }             from '../../hooks/useViewAs'

export default function ImpersonationBanner() {
  const { isImpersonating, getContextLabel } = useImpersonationStore()
  const { profile } = useAuthStore()
  const { exitViewAs } = useViewAs()

  // 🔒 Triple guard:
  //   1. user must be authenticated with a profile loaded
  //   2. user's system_role must be super_admin (DB truth, not just store)
  //   3. impersonation flag must be active
  if (!profile)                                return null
  if (profile.system_role !== 'super_admin')   return null
  if (!isImpersonating())                      return null

  return (
    <div style={{
      position:    'sticky',
      top:         0,
      zIndex:      1000,
      width:       '100%',
      padding:     '7px 16px',
      background:  'linear-gradient(90deg, #dc2626, #b91c1c)',
      color:       '#fff',
      display:     'flex',
      alignItems:  'center',
      justifyContent: 'space-between',
      gap:         12,
      borderBottom: '1px solid rgba(0,0,0,0.4)',
      fontSize:    12.5,
      fontFamily:  'system-ui, -apple-system, sans-serif',
      boxShadow:   '0 2px 8px rgba(220,38,38,0.4)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize:   10,
          padding:    '2px 7px',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.25)',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          flexShrink: 0
        }}>
          🔴 Admin View
        </span>
        <span style={{
          fontWeight: 500,
          overflow:   'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          Viewing as: {getContextLabel() || '(no context selected)'}
        </span>
        <span style={{ fontSize: 11, opacity: 0.8, flexShrink: 0 }}>
          · All actions logged
        </span>
      </div>

      <button
        onClick={exitViewAs}
        style={{
          padding:    '4px 10px',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.3)',
          border:     '0.5px solid rgba(255,255,255,0.3)',
          color:      '#fff',
          fontFamily: 'inherit',
          fontSize:   11.5,
          fontWeight: 500,
          cursor:     'pointer',
          flexShrink: 0
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.5)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.3)')}
      >
        Exit admin view ✕
      </button>
    </div>
  )
}
