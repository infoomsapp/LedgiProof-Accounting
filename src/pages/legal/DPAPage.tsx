// PATH: src/pages/legal/DPAPage.tsx
// Data Processing Agreement — content mirrors /legal/dpa.md
// Document version: 2026-05-02

import LegalPageLayout from '../../components/legal/LegalPageLayout'

export default function DPAPage() {
  return (
    <LegalPageLayout
      title="Data Processing Agreement"
      subtitle="For Bookkeeper or Accountant plans customers managing data on behalf of their own clients."
      lastUpdated="May 2, 2026"
    >

      <p>
        <strong>LedgiProof — Operated by Olympus Mont Systems LLC</strong><br />
        Maryland Department ID: W26738385<br />
        Effective Date: May 2, 2026
      </p>

      {/* Sales/legal contact callout */}
      <div className="legal-callout" style={{
        background: 'rgba(59,130,246,0.06)',
        borderColor: 'rgba(59,130,246,0.3)',
        marginTop: 18
      }}>
        <div className="legal-callout-title" style={{ color: '#1e40af' }}>
          📄 Need a counter-signed copy?
        </div>
        Email <a href="mailto:support@ledgiproof.com?subject=DPA%20Request">support@ledgiproof.com</a>{' '}
        with subject line "DPA Request" — we'll send you a copy for your records.
      </div>

      <hr />

      <h2 id="purpose">Purpose</h2>
      <p>
        This Data Processing Agreement (<strong>"DPA"</strong>) supplements the Terms of
        Service between Olympus Mont Systems LLC (<strong>"LedgiProof"</strong>,{' '}
        <strong>"Processor"</strong>) and the customer entity (<strong>"Customer"</strong>,{' '}
        <strong>"Controller"</strong>) subscribing to the LedgiProof Bookkeeper or Accountant plans or any plan
        where the Customer uploads, manages, or processes data belonging to its own clients
        (such as a bookkeeper managing PYME client data).
      </p>
      <p>
        This DPA defines the responsibilities of each party regarding personal data processed
        by LedgiProof on behalf of the Customer.
      </p>

      <h2 id="definitions">1. Definitions</h2>
      <ul>
        <li><strong>"Personal Data"</strong> means any information relating to an identified or identifiable natural person provided by Customer or generated through Customer's use of the Service.</li>
        <li><strong>"Customer Data"</strong> means all data uploaded, entered, or generated through the Service by Customer or Customer's authorized users.</li>
        <li><strong>"Sub-processor"</strong> means any third party engaged by LedgiProof to process Personal Data.</li>
        <li><strong>"Authorized User"</strong> means a person granted access to Customer's account, including team members, clients invited to portals, and accountants granted guest access.</li>
      </ul>

      <h2 id="roles">2. Roles of the Parties</h2>

      <h3>2.1 Customer as Controller</h3>
      <p>
        Customer is the <strong>Controller</strong> (or "business" under California law) of
        the Personal Data uploaded to or generated through the Service, including data about
        Customer's own clients (PYMEs).
      </p>
      <p>Customer is responsible for:</p>
      <ul>
        <li>The lawfulness of processing</li>
        <li>Obtaining any required consents from Customer's own clients</li>
        <li>Providing privacy notices to Customer's own clients</li>
        <li>Responding to data-subject rights requests from Customer's own clients</li>
        <li>Ensuring that data uploaded to the Service complies with applicable law</li>
      </ul>

      <h3>2.2 LedgiProof as Processor</h3>
      <p>
        LedgiProof is the <strong>Processor</strong> (or "service provider" under California
        law) acting on Customer's instructions to provide the Service.
      </p>
      <p>LedgiProof will:</p>
      <ul>
        <li>Process Personal Data only on documented instructions from Customer</li>
        <li>Implement appropriate technical and organizational security measures</li>
        <li>Assist Customer in responding to data-subject rights requests</li>
        <li>Notify Customer of any data breach affecting Customer Data</li>
        <li>Delete or return Customer Data upon termination as agreed</li>
      </ul>

      <h2 id="scope">3. Scope and Nature of Processing</h2>

      <h3>3.1 Subject Matter</h3>
      <p>Provision of cloud-based bookkeeping and financial management software, including:</p>
      <ul>
        <li>Storage and synchronization of bank transaction data</li>
        <li>AI-based transaction classification (semaphore)</li>
        <li>Document storage (receipts, invoices)</li>
        <li>Multi-client workspace management</li>
        <li>Audit trail (hash-chain) for compliance</li>
      </ul>

      <h3>3.2 Duration</h3>
      <p>
        For the duration of Customer's active subscription, plus the 90-day grace period after
        cancellation, plus any legally required retention period.
      </p>

      <h3>3.3 Categories of Data Subjects</h3>
      <ul>
        <li>Customer's employees and team members</li>
        <li>Customer's clients (PYMEs invited to portals)</li>
        <li>Individuals named in transactions, invoices, or receipts (vendors, payees)</li>
      </ul>

      <h3>3.4 Categories of Personal Data</h3>
      <ul>
        <li>Identifiers: names, email addresses, phone numbers, account IDs</li>
        <li>Financial data: bank transactions, invoices, receipts, payment history</li>
        <li>Communications: chat messages between Customer and Customer's clients</li>
        <li>Activity data: login times, IP addresses, feature usage</li>
      </ul>

      <h3>3.5 Special Categories</h3>
      <p>
        LedgiProof does not request or expect to receive special categories of personal data
        (race, religion, health, biometrics, etc.). Customer agrees not to upload such data
        to the Service.
      </p>

      <h2 id="instructions">4. Customer Instructions</h2>
      <p>LedgiProof processes Personal Data only as necessary to:</p>
      <ol>
        <li>Provide the Service per the Terms of Service</li>
        <li>Comply with Customer's documented instructions (e.g., delete data, export data)</li>
        <li>Comply with applicable law</li>
      </ol>
      <p>
        If LedgiProof believes an instruction violates applicable law, LedgiProof will notify
        Customer and may decline to act on it.
      </p>

      <h2 id="confidentiality">5. Confidentiality</h2>
      <p>LedgiProof ensures that personnel authorized to process Customer Data:</p>
      <ul>
        <li>Are bound by written confidentiality agreements</li>
        <li>Have undergone appropriate privacy and security training</li>
        <li>Access Customer Data only on a need-to-know basis</li>
      </ul>

      <h2 id="security">6. Security Measures</h2>

      <h3>6.1 Technical Measures</h3>
      <ul>
        <li><strong>Encryption in transit:</strong> TLS 1.3 for all data transmission</li>
        <li><strong>Encryption at rest:</strong> AES-256 for sensitive data; Supabase Vault for Plaid tokens</li>
        <li><strong>Authentication:</strong> bcrypt password hashing; multi-factor authentication (MFA/TOTP) available</li>
        <li><strong>Access controls:</strong> Row-Level Security (RLS) policies enforced at the database level</li>
        <li><strong>Audit logging:</strong> immutable hash-chained logs for all critical operations</li>
        <li><strong>Backup encryption:</strong> all backups are encrypted at rest</li>
      </ul>

      <h3>6.2 Organizational Measures</h3>
      <ul>
        <li>Principle of least privilege for internal access</li>
        <li>Regular security reviews and updates</li>
        <li>Documented incident response procedures</li>
        <li>Background checks for personnel with production access</li>
      </ul>

      <h2 id="sub-processors">7. Sub-processors</h2>

      <h3>7.1 Authorized Sub-processors</h3>
      <p>Customer authorizes LedgiProof to engage the following sub-processors:</p>
      <table>
        <thead>
          <tr>
            <th>Sub-processor</th>
            <th>Purpose</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>Supabase Inc.</strong></td><td>Database, auth, storage</td><td>United States</td></tr>
          <tr><td><strong>Plaid Inc.</strong></td><td>Bank connectivity</td><td>United States</td></tr>
          <tr><td><strong>Cloudflare Inc.</strong></td><td>DNS, CDN, security</td><td>United States</td></tr>
        </tbody>
      </table>

      <h3>7.2 New Sub-processors</h3>
      <p>LedgiProof will provide at least 30 days' notice of any new sub-processor by:</p>
      <ul>
        <li>Updating the sub-processors page</li>
        <li>Sending email notice to the Customer's account email</li>
      </ul>
      <p>
        If Customer reasonably objects to a new sub-processor, Customer may cancel the
        subscription and receive a pro-rated refund of any prepaid amounts.
      </p>

      <h3>7.3 Sub-processor Obligations</h3>
      <p>
        LedgiProof imposes contractual data protection obligations on each sub-processor that
        are no less protective than those in this DPA.
      </p>

      <h2 id="data-subject-rights">8. Data Subject Rights</h2>

      <h3>8.1 Customer's Responsibility</h3>
      <p>
        Customer is responsible for responding to requests from data subjects (Customer's
        clients, employees, or contacts) to exercise their rights under applicable law (access,
        deletion, correction, portability, opt-out).
      </p>

      <h3>8.2 LedgiProof's Assistance</h3>
      <p>LedgiProof provides Customer with tools to fulfill these requests:</p>
      <ul>
        <li><strong>Data export:</strong> Settings → "Download All Data" generates a portable archive</li>
        <li><strong>Data deletion:</strong> Settings → "Delete Workspace" or per-record deletion</li>
        <li><strong>Data correction:</strong> Customer can edit records directly through the Service</li>
      </ul>

      <h2 id="breach-notification">9. Data Breach Notification</h2>

      <h3>9.1 Notification to Customer</h3>
      <div className="legal-callout">
        <div className="legal-callout-title">⚠️ 72-hour breach notification</div>
        LedgiProof will notify Customer of a confirmed Personal Data breach affecting Customer
        Data without undue delay and <strong>no later than 72 hours</strong> after discovery.
      </div>
      <p>The notification will include:</p>
      <ul>
        <li>Nature of the breach</li>
        <li>Categories and approximate number of data subjects affected</li>
        <li>Likely consequences</li>
        <li>Measures taken or proposed to address the breach</li>
      </ul>

      <h3>9.2 Customer's Notification Obligations</h3>
      <p>
        Customer is responsible for notifying its own clients, employees, regulators, or other
        parties as required by applicable law (Maryland PIPA, CCPA, state breach notification
        laws, etc.).
      </p>

      <h2 id="audit-rights">10. Audit Rights</h2>
      <p>Customer has the right to audit LedgiProof's compliance with this DPA, subject to:</p>
      <ul>
        <li>Reasonable advance notice (at least 30 days)</li>
        <li>During business hours</li>
        <li>No more than once per calendar year (unless required after a breach)</li>
        <li>At Customer's expense</li>
        <li>Subject to mutually agreed confidentiality</li>
      </ul>
      <p>In lieu of an on-site audit, LedgiProof may provide:</p>
      <ul>
        <li>A current SOC 2 Type II report (when available)</li>
        <li>Self-attestation of security controls</li>
        <li>Responses to a reasonable security questionnaire</li>
      </ul>

      <h2 id="international-transfers">11. International Data Transfers</h2>
      <p>
        LedgiProof processes Customer Data in the <strong>United States only</strong>. We do
        not currently engage sub-processors outside the US, nor do we transfer data
        internationally.
      </p>
      <p>
        If Customer requires data residency outside the US, this DPA does not apply, and
        Customer should not subscribe to the Service.
      </p>

      <h2 id="termination">12. Termination and Data Return/Deletion</h2>
      <p>Upon termination of the underlying subscription:</p>
      <ul>
        <li>Customer has 90 days to export data via the self-service tools</li>
        <li>After 90 days, LedgiProof permanently deletes Customer Data, subject to legal retention requirements</li>
        <li>Customer can request earlier deletion by emailing <a href="mailto:support@ledgiproof.com">support@ledgiproof.com</a></li>
      </ul>
      <p>LedgiProof will provide written confirmation of deletion upon request.</p>

      <h2 id="liability">13. Liability</h2>
      <p>
        The liability provisions in the Terms of Service apply to claims arising under this
        DPA. The aggregate liability of LedgiProof under both the Terms and this DPA is
        limited as set forth in the Terms.
      </p>

      <h2 id="precedence">14. Order of Precedence</h2>
      <p>
        In case of conflict between this DPA and the Terms of Service, this DPA prevails with
        respect to data protection matters. In case of conflict between this DPA and applicable
        law, applicable law prevails.
      </p>

      <h2 id="governing-law">15. Governing Law</h2>
      <p>
        This DPA is governed by the laws of the <strong>State of Maryland</strong>, USA,
        without regard to conflict-of-laws principles.
      </p>

      <h2 id="acceptance">16. Acceptance</h2>
      <p>
        This DPA is automatically incorporated into the Terms of Service for Customers on the
        Bookkeeper or Accountant plans or any plan where Customer manages data on behalf of its own clients.
      </p>
      <p>By continuing to use the Service after the Effective Date, Customer accepts this DPA.</p>
      <p>For questions or to request a counter-signed copy:</p>
      <p>
        <strong>Olympus Mont Systems LLC</strong><br />
        Email: <a href="mailto:support@ledgiproof.com?subject=DPA%20Request">support@ledgiproof.com</a><br />
        Subject line: "DPA Request"<br />
        Maryland Department ID: W26738385
      </p>

    </LegalPageLayout>
  )
}