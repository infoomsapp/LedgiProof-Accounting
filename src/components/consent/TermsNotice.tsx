// PATH: src/components/consent/TermsNotice.tsx
// "By creating an account, you agree to..." -- the same one-line acceptance
// QuickBooks and Xero use, replacing the old required checkbox. The consent
// itself is still recorded (record_consent) right after signup; see
// SignUp.tsx and AccountSetup.tsx for where.
//
// Pre-auth screens are English-only by product decision (see src/i18n/index.ts).

export default function TermsNotice({ action }: { action: string }) {
  const link = { color: 'var(--lp-accent)', textDecoration: 'none', fontWeight: 500 } as const
  return (
    <div style={{
      fontSize: 11.5, color: 'var(--lp-text-muted)',
      textAlign: 'center', lineHeight: 1.55
    }}>
      By {action}, you agree to the{' '}
      <a href="/legal/terms" target="_blank" rel="noopener noreferrer" style={link}>Terms of Service</a>
      {' '}and{' '}
      <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={link}>Privacy Policy</a>.
    </div>
  )
}
