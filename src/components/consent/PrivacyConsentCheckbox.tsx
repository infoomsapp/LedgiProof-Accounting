// PATH: src/components/consent/PrivacyConsentCheckbox.tsx
// Required consent checkbox for SignUp.
//
// Drop into the SignUp form before the submit button:
//   <PrivacyConsentCheckbox checked={consent} onChange={setConsent} />
//   <button disabled={!consent || ...other validation}>Create account</button>
//
// The actual recording of consent (timestamp + version + user_id) happens in
// auth.store after successful signUp via record_consent() RPC.
// This component only captures the UI-level acceptance.

interface PrivacyConsentCheckboxProps {
  checked:  boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export default function PrivacyConsentCheckbox({
  checked,
  onChange,
  disabled = false
}: PrivacyConsentCheckboxProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 10,
        background: checked
          ? 'rgba(34,197,94,0.06)'
          : 'rgba(59,130,246,0.04)',
        border: checked
          ? '0.5px solid rgba(34,197,94,0.3)'
          : '0.5px solid rgba(59,130,246,0.18)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s'
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        style={{
          marginTop: 2,
          width: 16,
          height: 16,
          accentColor: '#3b82f6',
          cursor: disabled ? 'not-allowed' : 'pointer',
          flexShrink: 0
        }}
      />
      <span style={{
        fontSize: 12.5,
        color: '#cbd5e1',
        lineHeight: 1.55,
        userSelect: 'none'
      }}>
        I agree to the{' '}
        <a
          href="/legal/terms"
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}
        >
          Terms of Service
        </a>
        {' '}and{' '}
        <a
          href="/legal/privacy"
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}
        >
          Privacy Policy
        </a>
        . I understand my data will be processed in the United States.
      </span>
    </label>
  )
}