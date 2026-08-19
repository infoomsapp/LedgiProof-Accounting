// PATH: src/pages/legal/CookiesPolicyPage.tsx
// Cookies Policy — content mirrors /legal/cookies-policy.md
// Document version: 2026-05-02

import LegalPageLayout from '../../components/legal/LegalPageLayout'

export default function CookiesPolicyPage() {
  return (
    <LegalPageLayout
      title="Cookies & Local Storage Policy"
      subtitle="What we store in your browser and why."
      lastUpdated="May 2, 2026"
    >

      <p>
        <strong>LedgiProof — Operated by Olympus Mont Systems LLC</strong><br />
        Maryland Department ID: W26738385
      </p>

      <hr />

      <h2 id="what-are">1. What Are Cookies and Local Storage?</h2>
      <p>
        Cookies are small text files placed on your device by websites you visit.{' '}
        <strong>Local storage</strong> and <strong>session storage</strong> are similar
        technologies that store data in your browser without a fixed expiration.
      </p>
      <p>
        LedgiProof uses these technologies to operate the Service, remember your preferences,
        and keep you signed in.
      </p>

      <h2 id="what-we-use">2. Cookies and Storage We Use</h2>
      <p>
        We use <strong>only essential and functional</strong> technologies. We do{' '}
        <strong>not</strong> use advertising trackers, third-party retargeting cookies, or
        behavioral analytics.
      </p>

      <h3>2.1 Essential (Required for the Service to Work)</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Purpose</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>sb-&lt;project&gt;-auth-token</code></td>
            <td>Local Storage</td>
            <td>Supabase authentication session</td>
            <td>Until logout</td>
          </tr>
          <tr>
            <td><code>sb-&lt;project&gt;-auth-token-code-verifier</code></td>
            <td>Local Storage</td>
            <td>OAuth flow security</td>
            <td>5 minutes</td>
          </tr>
          <tr>
            <td><code>lp-impersonation</code></td>
            <td>Session Storage</td>
            <td>Super admin "View as" context</td>
            <td>Until tab closes</td>
          </tr>
        </tbody>
      </table>

      <h3>2.2 Functional (Improve User Experience)</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Purpose</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>lp-theme-preference</code></td>
            <td>Local Storage</td>
            <td>Remember dark/light theme</td>
            <td>Persistent</td>
          </tr>
          <tr>
            <td><code>lp-org-selected</code></td>
            <td>Local Storage</td>
            <td>Remember last active workspace</td>
            <td>Persistent</td>
          </tr>
          <tr>
            <td><code>lp-onboarding-step</code></td>
            <td>Session Storage</td>
            <td>Resume onboarding wizard</td>
            <td>Until tab closes</td>
          </tr>
        </tbody>
      </table>

      <h3>2.3 Third-Party Cookies (Limited)</h3>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
            <th>Cookie Names</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Plaid</strong></td>
            <td>Bank connection flow (only when you connect a bank)</td>
            <td>Set by <a href="https://plaid.com" target="_blank" rel="noopener noreferrer">plaid.com</a> per their privacy policy</td>
          </tr>
          <tr>
            <td><strong>Cloudflare</strong></td>
            <td>DDoS protection, bot mitigation</td>
            <td><code>__cf_bm</code>, <code>cf_clearance</code></td>
          </tr>
        </tbody>
      </table>

      <div className="legal-callout" style={{
        background: 'rgba(34,197,94,0.06)',
        borderColor: 'rgba(34,197,94,0.3)'
      }}>
        <div className="legal-callout-title" style={{ color: '#15803d' }}>
          ✓ What we do NOT integrate with
        </div>
        <ul style={{ margin: '6px 0 0 0', paddingLeft: 22 }}>
          <li>Google Analytics</li>
          <li>Facebook Pixel</li>
          <li>Any advertising network</li>
          <li>Any third-party retargeting service</li>
        </ul>
      </div>

      <h2 id="your-choices">3. Your Choices</h2>

      <h3>3.1 Essential Cookies and Storage</h3>
      <p>
        These cannot be disabled if you want to use the Service. Without them, you cannot stay
        logged in.
      </p>

      <h3>3.2 Functional Cookies</h3>
      <p>These can be cleared from your browser at any time:</p>
      <ul>
        <li><strong>Chrome:</strong> Settings → Privacy and security → Site settings → View permissions and data stored across sites</li>
        <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
        <li><strong>Safari:</strong> Preferences → Privacy → Manage Website Data</li>
        <li><strong>Edge:</strong> Settings → Privacy, search, and services → Cookies and site permissions</li>
      </ul>
      <p>Clearing them will sign you out and reset your preferences.</p>

      <h3>3.3 Browser Privacy Settings</h3>
      <p>You may configure your browser to:</p>
      <ul>
        <li>Reject all cookies (you will not be able to log in)</li>
        <li>Notify you when cookies are being set</li>
        <li>Delete cookies after each session</li>
      </ul>

      <h2 id="dnt">4. Do Not Track (DNT) Signals</h2>
      <p>
        Most browsers support a "Do Not Track" header. The legal status of DNT signals is
        unsettled in the United States, and we do not currently respond to them. However, we
        do not engage in the kind of tracking that DNT was designed to prevent (advertising
        and behavioral analytics).
      </p>

      <h2 id="changes">5. Changes to This Policy</h2>
      <p>
        We may update this Cookies Policy as we add or remove technologies from the Service.
        Material changes will be communicated via email or in-app notice.
      </p>

      <h2 id="contact">6. Contact Us</h2>
      <p>For questions about cookies or local storage:</p>
      <p>
        <strong>Email:</strong> <a href="mailto:support@ledgiproof.com?subject=Cookies%20Policy">support@ledgiproof.com</a>
      </p>

    </LegalPageLayout>
  )
}