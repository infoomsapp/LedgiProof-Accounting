// PATH: src/pages/legal/PlaidDisclosurePage.tsx
// Plaid End User Disclosure — content mirrors /legal/plaid-disclosure.md
// Document version: 2026-05-02

import LegalPageLayout from '../../components/legal/LegalPageLayout'

export default function PlaidDisclosurePage() {
  return (
    <LegalPageLayout
      title="Plaid End User Disclosure"
      subtitle="What happens when you connect a bank account through Plaid."
      lastUpdated="May 2, 2026"
    >

      <p>
        <strong>LedgiProof — Operated by Olympus Mont Systems LLC</strong><br />
        Maryland Department ID: W26738385
      </p>

      <hr />

      <h2 id="what-this-covers">What This Disclosure Covers</h2>
      <p>
        When you connect a bank account to LedgiProof, you are using <strong>Plaid Inc.</strong>{' '}
        ("Plaid"), a third-party service provider, to securely link your financial institution.
        This disclosure explains what data Plaid accesses and how it is shared with LedgiProof.
      </p>
      <p>You will be asked to confirm the following before connecting your first bank account.</p>

      <h2 id="required-disclosure">Required Disclosure</h2>
      <blockquote>
        <p>
          <strong>By connecting your bank account, you grant LedgiProof and Plaid the right,
          power, and authority to act on your behalf to access and transmit your personal and
          financial information from the relevant financial institution.</strong>
        </p>
        <p>
          <strong>You agree to your personal and financial information being transferred,
          stored, and processed by Plaid in accordance with the{' '}
          <a href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noopener noreferrer">
            Plaid End User Privacy Policy
          </a>.</strong>
        </p>
      </blockquote>

      <h2 id="what-plaid-accesses">What Plaid Accesses on Your Behalf</h2>
      <p>
        When you authenticate with your bank through Plaid, Plaid retrieves and shares with
        LedgiProof:
      </p>
      <ul>
        <li><strong>Account information:</strong> account name, type (checking, savings, credit card), last 4 digits of account number</li>
        <li><strong>Account balances:</strong> current balance, available balance</li>
        <li><strong>Transaction data:</strong> date, amount, merchant name, description, category, pending status</li>
        <li><strong>Account holder information:</strong> name on the account (if available from your institution)</li>
      </ul>
      <p>Plaid does <strong>not</strong> share with LedgiProof:</p>
      <ul>
        <li>Your bank login username or password</li>
        <li>Your full account number (except where you explicitly authorize for ACH-related features)</li>
        <li>Security questions or other authentication credentials</li>
      </ul>

      <h2 id="bank-credentials">Where Your Bank Credentials Go</h2>
      <p>
        Your bank login credentials (username and password) are entered directly into Plaid's
        secure interface. They are:
      </p>
      <ul>
        <li>Encrypted in transit using bank-grade TLS encryption</li>
        <li>Never stored in plaintext by Plaid or LedgiProof</li>
        <li>Never visible to LedgiProof staff</li>
      </ul>
      <p>
        If your bank supports OAuth-based authentication (most major US banks do), Plaid uses
        OAuth — meaning you authenticate directly on your bank's website, and your password
        never touches Plaid's systems.
      </p>

      <h2 id="your-control">Your Control Over Plaid Connections</h2>

      <h3>Disconnecting from LedgiProof</h3>
      <p>You can disconnect a bank account from LedgiProof at any time:</p>
      <ol>
        <li>Go to Settings → Bank Connections</li>
        <li>Click "Disconnect" next to the connection you want to remove</li>
        <li>The associated Plaid access token is immediately revoked</li>
      </ol>
      <p>
        After disconnection, LedgiProof will no longer receive transaction updates from that
        bank, but historical data already imported remains in your account (you can delete it
        manually if desired).
      </p>

      <h3>Managing All Plaid Connections Globally</h3>
      <p>
        Plaid maintains a portal where you can see and revoke <strong>all</strong> Plaid
        connections you have authorized — across LedgiProof and any other apps you use:
      </p>
      <p style={{ textAlign: 'center', fontSize: 16, margin: '18px 0' }}>
        <strong>
          <a href="https://my.plaid.com" target="_blank" rel="noopener noreferrer">
            my.plaid.com →
          </a>
        </strong>
      </p>
      <p>From there, you can:</p>
      <ul>
        <li>See every app that has access to your bank data through Plaid</li>
        <li>Revoke access individually</li>
        <li>Request deletion of data Plaid stores</li>
      </ul>

      <h2 id="plaid-data-use">Plaid's Use of Your Data</h2>
      <p>
        Plaid is bound by its own privacy policy, which is separate from LedgiProof's. Key points:
      </p>
      <ul>
        <li>Plaid processes data on behalf of LedgiProof under a service-provider agreement</li>
        <li>Plaid may retain data as required to provide the connectivity service</li>
        <li>Plaid does <strong>not</strong> sell your financial data</li>
        <li>For complete details, see the <a href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noopener noreferrer">Plaid End User Privacy Policy</a></li>
      </ul>

      <h2 id="ledgiproof-stores">Data LedgiProof Stores</h2>
      <p>LedgiProof stores the following data received from Plaid:</p>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Purpose</th>
            <th>Where stored</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Plaid <code>access_token</code></td>
            <td>Re-sync transactions periodically</td>
            <td>Encrypted in Supabase Vault (AES-256)</td>
          </tr>
          <tr>
            <td>Account names, types, balances</td>
            <td>Display in your dashboard</td>
            <td>Supabase database, encrypted at rest</td>
          </tr>
          <tr>
            <td>Transaction history</td>
            <td>Categorization, reports, semaphore</td>
            <td>Supabase database, encrypted at rest</td>
          </tr>
        </tbody>
      </table>
      <p>We do <strong>not</strong> store your bank login credentials at any time.</p>

      <h2 id="cancellation">What Happens If You Cancel Your LedgiProof Account</h2>
      <p>When you cancel:</p>
      <ol>
        <li>Your Plaid access tokens are immediately revoked from our side</li>
        <li>Bank synchronization stops</li>
        <li>After your 90-day grace period, all bank-related data is deleted from our systems (subject to legal retention requirements)</li>
      </ol>
      <p>
        To also revoke Plaid's stored data about you, visit{' '}
        <a href="https://my.plaid.com" target="_blank" rel="noopener noreferrer">my.plaid.com</a>{' '}
        directly.
      </p>

      <h2 id="questions">Questions?</h2>
      <ul>
        <li><strong>About LedgiProof's use of Plaid:</strong> <a href="mailto:support@ledgiproof.com">support@ledgiproof.com</a></li>
        <li><strong>About Plaid directly:</strong> <a href="https://plaid.com/contact" target="_blank" rel="noopener noreferrer">plaid.com/contact</a></li>
        <li><strong>To revoke Plaid access globally:</strong> <a href="https://my.plaid.com" target="_blank" rel="noopener noreferrer">my.plaid.com</a></li>
      </ul>

    </LegalPageLayout>
  )
}