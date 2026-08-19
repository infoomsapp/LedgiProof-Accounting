// PATH: src/components/settings/AccountTab.tsx

import { useEffect, useState } from 'react'
import { useAuthStore }   from '../../store/auth.store'
import { db }             from '../../lib/supabase'
import Button             from '../ui/Button'
import LpUserBadge        from '../ui/LpUserBadge'
import MfaSetup           from './MfaSetup'
import { useUserRole, USER_KIND_LABELS, USER_KIND_COLORS } from '../../hooks/useUserRole'

interface Props {
  onMessage?: (msg: { type: 'ok' | 'err'; text: string }) => void
}

export default function AccountTab({ onMessage }: Props) {
  const { profile } = useAuthStore()
  const role = useUserRole()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [newPw,       setNewPw]       = useState('')
  const [confirmPw,   setConfirmPw]   = useState('')
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '')
  }, [profile?.display_name])

  async function save() {
    if (!profile?.id) return
    setSaving(true)

    const { error } = await db.from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', profile.id)

    if (error) {
      onMessage?.({ type: 'err', text: error.message })
      setSaving(false)
      return
    }

    if (newPw) {
      if (newPw !== confirmPw) {
        onMessage?.({ type: 'err', text: "Passwords don't match" })
        setSaving(false); return
      }
      if (newPw.length < 8) {
        onMessage?.({ type: 'err', text: 'Password must be at least 8 characters' })
        setSaving(false); return
      }
      const { error: pwErr } = await db.auth.updateUser({ password: newPw })
      if (pwErr) {
        onMessage?.({ type: 'err', text: pwErr.message })
        setSaving(false); return
      }
      setNewPw(''); setConfirmPw('')
    }

    onMessage?.({ type: 'ok', text: 'Account updated' })
    setSaving(false)
  }

  const kindColor = USER_KIND_COLORS[role.kind]

  return (
    <div style={{ maxWidth: 480 }}>
      {/* LP Identity */}
      <div className="lp-card" style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 11, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12
        }}>
          Identity
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: `${kindColor}15`, border: `1px solid ${kindColor}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: kindColor, flexShrink: 0
          }}>
            {(profile?.display_name ?? profile?.email ?? '?')[0]?.toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--lp-text)', marginBottom: 5 }}>
              {profile?.display_name ?? profile?.email}
            </div>

            <div style={{
              display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap'
            }}>
              <span style={{
                fontSize: 10.5, fontWeight: 600,
                padding: '2px 8px', borderRadius: 100,
                color: kindColor, background: `${kindColor}15`,
                border: `0.5px solid ${kindColor}40`,
                letterSpacing: '0.04em', textTransform: 'uppercase'
              }}>
                {USER_KIND_LABELS[role.kind]}
              </span>
              <LpUserBadge
                code={profile?.lp_user_code ?? null}
                tier={profile?.tier ?? 'user'}
                size="sm"
                showTier
              />
              {profile?.lp_user_code && (
                <button
                  onClick={() => navigator.clipboard.writeText(profile.lp_user_code ?? '')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 10.5, color: '#3b82f6', fontFamily: 'inherit'
                  }}
                >
                  Copy
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit profile */}
      <div className="lp-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
          Profile
        </div>

        <div>
          <label style={lbl}>Display name</label>
          <input
            className="lp-input"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div>
          <label style={lbl}>Email (login)</label>
          <input
            className="lp-input"
            value={profile?.email ?? ''}
            disabled
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
          />
          <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>
            Email change requires re-authentication. Contact support.
          </div>
        </div>

        <div style={{ borderTop: '0.5px solid var(--lp-border)', paddingTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--lp-text-muted)', marginBottom: 12 }}>
            Change password
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>New password</label>
            <input
              type="password"
              className="lp-input"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Confirm password</label>
            <input
              type="password"
              className="lp-input"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              placeholder="••••••••"
              style={{
                borderColor: confirmPw && newPw !== confirmPw
                  ? 'rgba(239,68,68,0.5)' : undefined
              }}
            />
          </div>
        </div>

        <Button variant="primary" loading={saving} onClick={save}>
          Save account
        </Button>

        <MfaSetup />
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = {
  fontSize: 12, color: 'var(--lp-text-muted)',
  display: 'block', marginBottom: 5
}