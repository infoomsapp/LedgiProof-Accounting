// PATH: src/pages/legal/PrivacyPolicyPage.tsx
// Privacy Policy page — content mirrors /legal/privacy-policy.md.
//
// IMPORTANT: When the master MD is updated, also update this JSX.
// Document version: 2026-05-02
//
// Why no react-markdown? Zero new deps. Static content rendered as semantic HTML.

import LegalPageLayout from '../../components/legal/LegalPageLayout'

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your information."
      lastUpdated="May 2, 2026"
    >

      {/* TOC */}
      <nav className="legal-toc">
        <div className="legal-toc-title">On this page</div>
        <ul>
          <li><a href="#introduction">1. Introduction</a></li>
          <li><a href="#information-we-collect">2. Information We Collect</a></li>
          <li><a href="#how-we-use">3. How We Use Your Information</a></li>
          <li><a href="#how-we-share">4. How We Share Your Information</a></li>
          <li><a href="#data-retention">5. Data Retention</a></li>
          <li><a href="#privacy-rights">6. Your Privacy Rights</a></li>
          <li><a href="#plaid-disclosure">7. Plaid Disclosure</a></li>
          <li><a href="#data-security">8. Data Security</a></li>
          <li><a href="#childrens-privacy">9. Children's Privacy</a></li>
          <li><a href="#international-users">10. International Users</a></li>
          <li><a href="#changes">11. Changes to This Policy</a></li>
          <li><a href="#contact">12. Contact Us</a></li>
        </ul>
      </nav>

      {/* Identity card */}
      <p>
        <strong>LedgiProof — Operated by Olympus Mont Systems LLC</strong><br />
        Maryland Department ID: W26738385<br />
        Effective Date: May 2, 2026
      </p>

      <hr />

      {/* ── 1 ─────────────────────────────────────────────────────────── */}
      <h2 id="introduction">1. Introduction</h2>
      <p>
        This Privacy Policy describes how Olympus Mont Systems LLC, a Maryland
        limited liability company (<strong>"LedgiProof"</strong>, <strong>"we"</strong>,{' '}
        <strong>"us"</strong>, or <strong>"our"</strong>), collects, uses, stores, shares,
        and protects information when you use our website, web application, or mobile
        applications (collectively, the <strong>"Service"</strong>).
      </p>
      <p>
        By using the Service, you agree to the collection and use of information in
        accordance with this Privacy Policy. If you do not agree with our policies and
        practices, do not use the Service.
      </p>
      <p>This Privacy Policy applies to all users of the Service, including:</p>
      <ul>
        <li>Self-employed users on the Starter or Entrepreneur plans</li>
        <li>Bookkeepers and accounting firms on the Bookkeeper or Accountant plans</li>
        <li>Client users (PYME owners) invited to access portals by their bookkeeper</li>
      </ul>
      <div className="legal-callout">
        <div className="legal-callout-title">⚠️ US-only Service</div>
        This Service is designed for users located in the United States. By using the Service,
        you confirm that you are accessing it from the United States. We are not currently
        structured to comply with the EU General Data Protection Regulation (GDPR), the UK
        Data Protection Act, or other non-US privacy laws.
      </div>

      {/* ── 2 ─────────────────────────────────────────────────────────── */}
      <h2 id="information-we-collect">2. Information We Collect</h2>

      <h3>2.1 Information You Provide Directly</h3>
      <p>When you create an account or use the Service, we collect:</p>
      <ul>
        <li><strong>Account information:</strong> name, email address, password (stored as a salted bcrypt hash, never in plaintext)</li>
        <li><strong>Profile information:</strong> display name, business or firm name, billing address, tax identification (when voluntarily provided)</li>
        <li><strong>Payment information:</strong> processed by our payment processor; we do not store your full credit card numbers on our servers</li>
        <li><strong>Communications:</strong> messages you send to us, and messages within the Service (such as transaction-level chat between bookkeepers and clients)</li>
        <li><strong>Documents:</strong> receipts, invoices, statements, and other files you upload</li>
      </ul>

      <h3>2.2 Information from Connected Financial Institutions (via Plaid)</h3>
      <p>
        When you connect a bank account to LedgiProof, we use <strong>Plaid Inc.</strong>{' '}
        ("Plaid") to securely access your financial data on your behalf. The data we receive
        from Plaid includes:
      </p>
      <ul>
        <li>Account names and types (checking, savings, credit card)</li>
        <li>Account balances</li>
        <li>Transaction history (date, amount, merchant name, description, category)</li>
        <li>Account and routing numbers (when applicable for connected accounts)</li>
      </ul>
      <p>
        <strong>We do NOT receive or store your bank login credentials.</strong> Your username
        and password for your financial institution are entered directly into Plaid's secure
        interface, which uses bank-grade 256-bit encryption.
      </p>
      <p>
        For information about Plaid's data practices, see Section 7 below and Plaid's privacy
        policy at <a href="https://plaid.com/legal" target="_blank" rel="noopener noreferrer">plaid.com/legal</a>.
      </p>

      <h3>2.3 Information We Collect Automatically</h3>
      <p>When you use the Service, we automatically collect:</p>
      <ul>
        <li><strong>Device information:</strong> browser type, operating system, screen resolution</li>
        <li><strong>Log data:</strong> IP address, pages accessed, time spent on the Service, error logs</li>
        <li><strong>Usage data:</strong> features used, frequency of use, transaction counts</li>
        <li><strong>Cookies and similar technologies:</strong> see our <a href="/legal/cookies">Cookies Policy</a></li>
      </ul>
      <p>
        We do <strong>not</strong> use third-party advertising tracking pixels, retargeting
        cookies, or behavioral advertising trackers.
      </p>

      {/* ── 3 ─────────────────────────────────────────────────────────── */}
      <h2 id="how-we-use">3. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ol>
        <li><strong>Provide the Service:</strong> authenticate users, sync bank transactions, calculate semaphore status, generate reports, send invoices, classify expenses</li>
        <li><strong>Operate AI features:</strong> our AI semaphore engine analyzes your transaction patterns to flag those that need review. This processing is performed on our infrastructure; transaction-level data is <strong>not sent to third-party AI providers</strong> without your knowledge</li>
        <li><strong>Improve the Service:</strong> analyze usage patterns to identify bugs, improve features, and develop new functionality</li>
        <li><strong>Communicate with you:</strong> send service updates, security alerts, billing notifications, and respond to support requests</li>
        <li><strong>Ensure security:</strong> detect and prevent fraud, unauthorized access, and abuse</li>
        <li><strong>Comply with legal obligations:</strong> maintain records as required by tax law, regulatory bodies, or court orders</li>
      </ol>
      <p>
        We do <strong>not</strong> sell your personal information to third parties for
        advertising or marketing purposes.
      </p>

      {/* ── 4 ─────────────────────────────────────────────────────────── */}
      <h2 id="how-we-share">4. How We Share Your Information</h2>
      <p>We share information only in the following circumstances:</p>

      <h3>4.1 With Service Providers (Sub-processors)</h3>
      <p>
        We work with trusted third-party providers who process data on our behalf under
        written agreements. As of the effective date, our sub-processors are:
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
            <th>Location</th>
            <th>Privacy Policy</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Supabase Inc.</strong></td>
            <td>Database, authentication, file storage</td>
            <td>United States</td>
            <td><a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">supabase.com/privacy</a></td>
          </tr>
          <tr>
            <td><strong>Plaid Inc.</strong></td>
            <td>Bank account connectivity</td>
            <td>United States</td>
            <td><a href="https://plaid.com/legal" target="_blank" rel="noopener noreferrer">plaid.com/legal</a></td>
          </tr>
          <tr>
            <td><strong>Cloudflare Inc.</strong></td>
            <td>DNS, CDN, DDoS protection</td>
            <td>United States</td>
            <td><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">cloudflare.com/privacypolicy</a></td>
          </tr>
        </tbody>
      </table>
      <p>
        We will notify users in advance of any material changes to this list.
      </p>

      <h3>4.2 With Your Bookkeeper or Clients</h3>
      <p>
        If you are a self-employed user who invites a bookkeeper to access your data via the
        accountant access feature, that bookkeeper will see the data within your
        workspace.
      </p>
      <p>
        If you are a bookkeeper, your invited PYME clients will see only the transactions
        and messages you assign to them; they cannot see your other clients.
      </p>

      <h3>4.3 With Law Enforcement or Legal Authorities</h3>
      <p>We may disclose information when required by:</p>
      <ul>
        <li>A valid subpoena, court order, or other legal process</li>
        <li>A good-faith belief that disclosure is necessary to comply with applicable law</li>
        <li>A need to investigate fraud, security threats, or violations of our Terms of Service</li>
        <li>The protection of the rights, property, or safety of LedgiProof, our users, or the public</li>
      </ul>
      <p>We will notify the affected user when legally permitted to do so.</p>

      <h3>4.4 In Connection with Business Transfers</h3>
      <p>
        If LedgiProof or Olympus Mont Systems LLC is involved in a merger, acquisition, or
        sale of assets, your information may be transferred to the acquiring entity. You will
        be notified before your information is transferred and becomes subject to a different
        privacy policy.
      </p>

      {/* ── 5 ─────────────────────────────────────────────────────────── */}
      <h2 id="data-retention">5. Data Retention</h2>
      <p>
        We retain your information for as long as your account is active and for{' '}
        <strong>90 days after account cancellation</strong> ("grace period"), during which:
      </p>
      <ul>
        <li>You may reactivate your account and recover all data</li>
        <li>You may export your data using the "Download My Data" feature in Settings</li>
        <li>Your data is <strong>not</strong> accessible to other users</li>
      </ul>
      <p>
        After the 90-day grace period, your data will be <strong>permanently deleted</strong>{' '}
        from our active systems within 30 days, except as required by law:
      </p>
      <ul>
        <li><strong>Tax records</strong> may be retained for up to 7 years to comply with IRS retention requirements (26 U.S.C. § 6501)</li>
        <li><strong>Audit logs</strong> (immutable hash chain) are retained for legal and compliance purposes</li>
        <li><strong>Backups</strong> containing your data may persist for up to 90 additional days before being overwritten in the normal backup rotation cycle</li>
      </ul>
      <p>
        You may request earlier deletion by contacting{' '}
        <a href="mailto:support@ledgiproof.com">support@ledgiproof.com</a>, subject to
        applicable legal retention requirements.
      </p>

      {/* ── 6 ─────────────────────────────────────────────────────────── */}
      <h2 id="privacy-rights">6. Your Privacy Rights</h2>

      <h3>6.1 Rights for All Users</h3>
      <p>You have the right to:</p>
      <ul>
        <li><strong>Access</strong> the personal information we hold about you</li>
        <li><strong>Correct</strong> any inaccurate or incomplete information</li>
        <li><strong>Export</strong> your data in a portable format (JSON + CSV) via Settings → "Download My Data"</li>
        <li><strong>Delete</strong> your account and request deletion of your data</li>
        <li><strong>Opt out</strong> of non-essential communications (marketing, product updates)</li>
        <li><strong>Withdraw consent</strong> at any time for processing that relies on consent</li>
      </ul>

      <h3>6.2 Maryland Residents (MODPA Rights)</h3>
      <p>
        If you are a Maryland resident, you have rights under the{' '}
        <strong>Maryland Online Data Privacy Act (MODPA)</strong>, effective October 1, 2025:
      </p>
      <ul>
        <li>Right to confirm whether we process your personal data</li>
        <li>Right to access the personal data we hold about you</li>
        <li>Right to correct inaccuracies in your personal data</li>
        <li>Right to delete your personal data</li>
        <li>Right to data portability</li>
        <li>Right to opt-out of: targeted advertising, sale of personal data, or profiling</li>
      </ul>
      <p>
        To exercise any of these rights, email{' '}
        <a href="mailto:support@ledgiproof.com?subject=MODPA%20Request">support@ledgiproof.com</a>{' '}
        with subject line "MODPA Request". We respond within <strong>45 days</strong>.
      </p>

      <h3>6.3 California Residents (CCPA/CPRA Rights)</h3>
      <p>If you are a California resident, you have rights under the CCPA/CPRA:</p>
      <ul>
        <li>Right to know what personal information we collect, use, and disclose</li>
        <li>Right to delete the personal information we have collected</li>
        <li>Right to correct inaccurate personal information</li>
        <li>Right to opt-out of the sale or sharing of personal information — <strong>we do not sell or share for behavioral advertising</strong></li>
        <li>Right to limit use of sensitive personal information</li>
        <li>Right to non-discrimination for exercising these rights</li>
      </ul>
      <p>
        To exercise any of these rights, email{' '}
        <a href="mailto:support@ledgiproof.com?subject=CCPA%20Request">support@ledgiproof.com</a>{' '}
        with subject line "CCPA Request".
      </p>

      <h3>6.4 Rights for Other US State Residents</h3>
      <p>
        We extend similar rights to residents of states with comparable privacy laws including
        Virginia (VCDPA), Colorado (CPA), Connecticut (CTDPA), Utah (UCPA), Texas (TDPSA), and
        others.
      </p>

      {/* ── 7 ─────────────────────────────────────────────────────────── */}
      <h2 id="plaid-disclosure">7. Plaid End User Privacy Disclosure</h2>
      <p>When you connect a bank account to LedgiProof through Plaid:</p>
      <blockquote>
        <p>
          <strong>By using LedgiProof, you grant LedgiProof and Plaid the right, power, and
          authority to act on your behalf to access and transmit your personal and financial
          information from the relevant financial institution. You agree to your personal and
          financial information being transferred, stored, and processed by Plaid in
          accordance with the{' '}
          <a href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noopener noreferrer">
            Plaid End User Privacy Policy
          </a>.</strong>
        </p>
      </blockquote>
      <p>Plaid acts as our service provider to access your financial data. Plaid:</p>
      <ul>
        <li>Encrypts your bank credentials end-to-end</li>
        <li>Does not share your bank login credentials with LedgiProof</li>
        <li>Maintains its own privacy policy governing the data it collects</li>
      </ul>
      <p>You can revoke Plaid's access to your bank account at any time by:</p>
      <ol>
        <li>Going to Settings → Bank Connections in LedgiProof and clicking "Disconnect"</li>
        <li>Visiting <a href="https://my.plaid.com" target="_blank" rel="noopener noreferrer">my.plaid.com</a> to manage all Plaid connections globally</li>
      </ol>

      {/* ── 8 ─────────────────────────────────────────────────────────── */}
      <h2 id="data-security">8. Data Security</h2>
      <p>We implement industry-standard security measures to protect your information:</p>
      <ul>
        <li><strong>Encryption in transit:</strong> all data transmitted between your device and our servers is encrypted using TLS 1.3</li>
        <li><strong>Encryption at rest:</strong> sensitive data including Plaid access tokens is encrypted using Supabase Vault and AES-256</li>
        <li><strong>Authentication:</strong> passwords are hashed using bcrypt; multi-factor authentication (MFA/TOTP) is available</li>
        <li><strong>Access controls:</strong> Row-Level Security (RLS) policies enforced at the database level</li>
        <li><strong>Audit logging:</strong> an immutable, hash-chained audit log records all critical operations</li>
        <li><strong>Backup encryption:</strong> all backups are encrypted at rest</li>
      </ul>

      <h3>8.1 Breach Notification</h3>
      <p>
        If we discover a security incident affecting your personal information, we will notify
        you in accordance with applicable breach notification laws, including:
      </p>
      <ul>
        <li><strong>Maryland Personal Information Protection Act (PIPA)</strong> — notification within 45 days of discovery</li>
        <li>Other state breach notification laws as applicable to your residence</li>
      </ul>

      {/* ── 9 ─────────────────────────────────────────────────────────── */}
      <h2 id="childrens-privacy">9. Children's Privacy</h2>
      <p>
        The Service is not directed to individuals under the age of 18. We do not knowingly
        collect personal information from children. If you become aware that a child has
        provided us with personal information, please contact{' '}
        <a href="mailto:support@ledgiproof.com">support@ledgiproof.com</a>, and we will take
        steps to delete such information.
      </p>

      {/* ── 10 ────────────────────────────────────────────────────────── */}
      <h2 id="international-users">10. International Users</h2>
      <p>
        The Service is hosted and operated in the United States. By using the Service, users
        outside the United States acknowledge that their information will be transferred to
        and processed in the United States, where data protection laws may differ from those
        of their home country.
      </p>
      <p>
        We are not currently structured to provide GDPR-level protections to users in the
        European Economic Area or the United Kingdom. If you are located in such a
        jurisdiction, please consider this before providing personal information.
      </p>

      {/* ── 11 ────────────────────────────────────────────────────────── */}
      <h2 id="changes">11. Changes to This Privacy Policy</h2>
      <p>We may update this Privacy Policy from time to time. When we make changes, we will:</p>
      <ul>
        <li>Update the "Last Updated" date at the top of this policy</li>
        <li>Notify you via email if changes are material</li>
        <li>Post a prominent notice on our website for 30 days</li>
      </ul>
      <p>
        Continued use of the Service after changes become effective constitutes acceptance of
        the revised policy.
      </p>

      {/* ── 12 ────────────────────────────────────────────────────────── */}
      <h2 id="contact">12. Contact Us</h2>
      <p>For questions about this Privacy Policy or to exercise your privacy rights:</p>
      <p>
        <strong>Olympus Mont Systems LLC</strong><br />
        Email: <a href="mailto:support@ledgiproof.com">support@ledgiproof.com</a><br />
        Maryland Department ID: W26738385<br />
        Website: <a href="https://ledgiproof.com">ledgiproof.com</a>
      </p>
      <p>For privacy-specific requests, please use these subject lines:</p>
      <ul>
        <li><code>Privacy Request</code> — general questions</li>
        <li><code>MODPA Request</code> — Maryland-specific rights</li>
        <li><code>CCPA Request</code> — California-specific rights</li>
        <li><code>Data Export Request</code> — request a copy of your data</li>
        <li><code>Data Deletion Request</code> — request account/data deletion</li>
        <li><code>Security Issue</code> — report a vulnerability or security concern</li>
      </ul>
      <p>
        We respond to privacy inquiries within 30 days (45 days for state-specific privacy
        law requests).
      </p>

    </LegalPageLayout>
  )
}