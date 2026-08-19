// PATH: src/pages/legal/TermsOfServicePage.tsx
// Terms of Service — content mirrors /legal/terms-of-service.md.
// Document version: 2026-05-02

import LegalPageLayout from '../../components/legal/LegalPageLayout'

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      subtitle="The agreement that governs your use of LedgiProof."
      lastUpdated="May 2, 2026"
    >

      <nav className="legal-toc">
        <div className="legal-toc-title">On this page</div>
        <ul>
          <li><a href="#acceptance">1. Acceptance of Terms</a></li>
          <li><a href="#service">2. The Service</a></li>
          <li><a href="#accounts">3. Accounts and Eligibility</a></li>
          <li><a href="#plans-billing">4. Plans, Trials, Billing</a></li>
          <li><a href="#acceptable-use">5. Acceptable Use</a></li>
          <li><a href="#data-ownership">6. Data Ownership</a></li>
          <li><a href="#plaid">7. Plaid Connectivity</a></li>
          <li><a href="#ai-limits">8. AI Features and Limitations</a></li>
          <li><a href="#privacy">9. Privacy</a></li>
          <li><a href="#disclaimers">10. Disclaimers</a></li>
          <li><a href="#liability">11. Limitation of Liability</a></li>
          <li><a href="#indemnification">12. Indemnification</a></li>
          <li><a href="#termination">13. Termination</a></li>
          <li><a href="#modifications">14. Modifications</a></li>
          <li><a href="#governing-law">15. Governing Law / Arbitration</a></li>
          <li><a href="#miscellaneous">16. Miscellaneous</a></li>
          <li><a href="#contact">17. Contact</a></li>
        </ul>
      </nav>

      <p>
        <strong>LedgiProof — Operated by Olympus Mont Systems LLC</strong><br />
        Maryland Department ID: W26738385<br />
        Effective Date: May 2, 2026
      </p>

      <hr />

      {/* ── 1 ───────────────────────────────────────────────────────── */}
      <h2 id="acceptance">1. Acceptance of Terms</h2>
      <p>
        These Terms of Service (the <strong>"Terms"</strong>) constitute a binding legal
        agreement between you (<strong>"you"</strong>, <strong>"your"</strong>) and Olympus
        Mont Systems LLC, a Maryland limited liability company (<strong>"LedgiProof"</strong>,{' '}
        <strong>"we"</strong>, <strong>"us"</strong>, or <strong>"our"</strong>), regarding
        your use of the LedgiProof software, website, web application, mobile applications,
        and related services (collectively, the <strong>"Service"</strong>).
      </p>
      <p>
        By creating an account, accessing, or using the Service, you agree to be bound by
        these Terms and our <a href="/legal/privacy">Privacy Policy</a>. If you do not agree,
        do not use the Service.
      </p>
      <p>
        If you are accessing or using the Service on behalf of a company or other entity, you
        represent that you have the authority to bind that entity to these Terms.
      </p>
      <p>You must be at least 18 years old and a resident of the United States to use the Service.</p>

      {/* ── 2 ───────────────────────────────────────────────────────── */}
      <h2 id="service">2. The Service</h2>
      <p>LedgiProof provides cloud-based bookkeeping and financial management software. Features include, depending on your subscription plan:</p>
      <ul>
        <li>AI-powered transaction classification (semaphore engine)</li>
        <li>Bank account connectivity through Plaid</li>
        <li>Receipt capture and storage</li>
        <li>Mileage tracking</li>
        <li>Schedule C export</li>
        <li>Quarterly tax estimation</li>
        <li>Invoicing</li>
        <li>Reconciliation (Bookkeeper and Accountant plans)</li>
        <li>Multi-client management for firms (Bookkeeper and Accountant plans)</li>
        <li>Cryptographic audit trail (Bookkeeper and Accountant plans)</li>
      </ul>

      {/* ── 3 ───────────────────────────────────────────────────────── */}
      <h2 id="accounts">3. Accounts and Eligibility</h2>

      <h3>3.1 Account Creation</h3>
      <p>To use most features of the Service, you must create an account. You agree to:</p>
      <ul>
        <li>Provide accurate, current, and complete information</li>
        <li>Maintain the security of your account credentials</li>
        <li>Promptly notify us of any unauthorized access at <a href="mailto:support@ledgiproof.com">support@ledgiproof.com</a></li>
        <li>Accept responsibility for all activity that occurs under your account</li>
      </ul>

      <h3>3.2 Account Types</h3>
      <p>LedgiProof offers three types of accounts:</p>
      <ul>
        <li><strong>Self-Employed Account:</strong> for individuals tracking their own business finances</li>
        <li><strong>Bookkeeper Account:</strong> for professionals managing multiple clients</li>
        <li><strong>Accountant Account:</strong> for profesionals solo or accountant firm</li>
        <li><strong>Client Account (PYME):</strong> issued by invitation only, for clients of accountant/bookkeper</li>
      </ul>

      <h3>3.3 One Account Per Person</h3>
      <p>
        You may not create or maintain multiple accounts to circumvent plan limits or trial
        periods. We reserve the right to suspend or terminate duplicate accounts.
      </p>

      {/* ── 4 ───────────────────────────────────────────────────────── */}
      <h2 id="plans-billing">5. Subscription Plans, Trials, and Billing</h2>

      <h3>5.1 Plans</h3>
      <table>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Price</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>Starter</strong></td><td>$9.99/mo (first month free)</td><td>Self-employed, manual entry</td></tr>
          <tr><td><strong>Entrepreneur</strong></td><td>$19.99/mo</td><td>Self-employed with bank sync</td></tr>
          <tr><td><strong>Bookkeeper</strong></td><td>$59.99/mo</td><td>Independent bookkeepers</td></tr>
          <tr><td><strong>Accountant</strong></td><td>$69.99/mo</td><td>Accountant &amp; CPA firms</td></tr>
        </tbody>
      </table>

      <h3>4.2 Free Trials</h3>
      <p>
        Bookkeeper and Accountant accounts include a <strong>15-day free trial</strong>{' '}
        without a credit card requirement. At the end of the trial, your account will downgrade
        to the Starter plan unless you choose to subscribe.
      </p>

      <h3>4.3 Billing</h3>
      <p>When you subscribe to a paid plan:</p>
      <ul>
        <li>You authorize us (and our payment processor) to charge your payment method on a recurring monthly basis</li>
        <li>Subscriptions automatically renew unless canceled before the end of the current billing period</li>
        <li>All fees are exclusive of applicable taxes which will be added to your invoice</li>
        <li>All payments are non-refundable except as required by law or expressly stated in these Terms</li>
      </ul>

      <h3>4.4 Plaid Banking Fees</h3>
      <p>Some plans include a per-connection fee for bank account connectivity:</p>
      <ul>
        <li><strong>Starter plan:</strong> $1.50/month per Plaid bank connection</li>
        <li><strong>Entrepreneur, Bookkeeper, Accountant plans:</strong> Plaid fees included in subscription price (subject to fair-use limits per plan)</li>
      </ul>

      <h3>4.5 Cancellation and Refunds</h3>
      <p>You may cancel your subscription at any time from Settings → Billing. Upon cancellation:</p>
      <ul>
        <li>You retain access to paid features until the end of the current billing period</li>
        <li>Your account enters a <strong>90-day grace period</strong> during which you may reactivate</li>
        <li>After the grace period, your data will be permanently deleted as described in our Privacy Policy</li>
      </ul>
      <p>
        We do not provide pro-rated refunds for partial months. Refunds may be issued at our
        sole discretion in cases of billing errors.
      </p>

      <h3>4.6 Failed Payments</h3>
      <p>If a payment fails, we will:</p>
      <ol>
        <li>Attempt to re-charge your payment method up to 3 times over 7 days</li>
        <li>Send you email notifications at each attempt</li>
        <li>After 7 days of failed payments, your account will be downgraded to the Starter plan</li>
      </ol>

      {/* ── 5 ───────────────────────────────────────────────────────── */}
      <h2 id="acceptable-use">5. Acceptable Use</h2>
      <p>You agree NOT to:</p>
      <ul>
        <li>Use the Service for any illegal, fraudulent, or unauthorized purpose</li>
        <li>Reverse-engineer, decompile, or attempt to extract source code from the Service</li>
        <li>Interfere with or disrupt the integrity or performance of the Service</li>
        <li>Attempt to gain unauthorized access to other users' accounts</li>
        <li>Transmit malware, viruses, or any malicious code</li>
        <li>Use the Service to send spam or harass other users</li>
        <li>Resell, sublicense, or commercially redistribute the Service without prior written consent</li>
        <li>Use the Service for money laundering, terrorist financing, sanctions evasion, or any activity prohibited by US law</li>
        <li>Misrepresent your identity or affiliation with any person or organization</li>
      </ul>
      <p>
        We reserve the right to investigate and take appropriate action — including suspension
        or termination of your account — for any violation.
      </p>

      {/* ── 6 ───────────────────────────────────────────────────────── */}
      <h2 id="data-ownership">6. Data Ownership and Licensing</h2>

      <h3>6.1 Your Data</h3>
      <p>
        You own the data you upload, enter, or generate through the Service{' '}
        (<strong>"Your Data"</strong>), including transactions, receipts, invoices, messages,
        and reports.
      </p>
      <p>You grant us a limited, worldwide, non-exclusive, royalty-free license to:</p>
      <ul>
        <li>Host, store, and process Your Data to provide the Service to you</li>
        <li>Display Your Data to authorized users (such as your bookkeeper or invited clients)</li>
        <li>Use Your Data in aggregate, anonymized form to improve the Service</li>
      </ul>

      <h3>6.2 Our Service</h3>
      <p>We retain all rights, title, and interest in the Service itself, including:</p>
      <ul>
        <li>Software code (server, client, mobile)</li>
        <li>AI models and the semaphore classification engine</li>
        <li>The hash-chain audit infrastructure</li>
        <li>Branding, logos, and trademarks</li>
        <li>Documentation and educational content</li>
      </ul>

      <h3>6.3 Feedback</h3>
      <p>
        If you provide us with feedback, suggestions, or feature requests, you grant us a
        perpetual, irrevocable, royalty-free license to use that feedback for any purpose
        without obligation.
      </p>

      {/* ── 7 ───────────────────────────────────────────────────────── */}
      <h2 id="plaid">7. Plaid and Bank Connectivity</h2>

      <h3>7.1 Authorization</h3>
      <p>
        By connecting a bank account through the Service, you authorize us and our service
        provider Plaid Inc. to access your bank account on your behalf to retrieve transaction
        data, balances, and other financial information.
      </p>

      <h3>7.2 Disclaimer</h3>
      <p>
        LedgiProof is <strong>not a bank</strong>, broker-dealer, or financial institution.
        We do not move money on your behalf. The Service displays and analyzes your financial
        data but does not initiate payments, transfers, or transactions with your bank.
      </p>

      <h3>7.3 Accuracy of Bank Data</h3>
      <p>We rely on Plaid and your financial institution for the accuracy of bank data. We do not guarantee:</p>
      <ul>
        <li>Real-time synchronization of transactions</li>
        <li>Completeness of transaction history</li>
        <li>Continuous availability of bank connectivity</li>
      </ul>

      {/* ── 8 ───────────────────────────────────────────────────────── */}
      <h2 id="ai-limits">8. AI Features and Limitations</h2>
      <div className="legal-callout">
        <div className="legal-callout-title">⚠️ Important: No Financial, Legal, or Tax Advice</div>
        The Service does not provide financial, legal, or tax advice. Output from AI features
        is for informational purposes only. You should consult a qualified professional (CPA,
        tax attorney, financial advisor) for advice specific to your situation.
      </div>
      <p>You are responsible for reviewing AI output before relying on it. We are not liable for errors arising from your reliance on AI suggestions.</p>

      {/* ── 9 ───────────────────────────────────────────────────────── */}
      <h2 id="privacy">9. Privacy</h2>
      <p>
        Our collection and use of personal information is governed by our{' '}
        <a href="/legal/privacy">Privacy Policy</a>, which is incorporated into these Terms
        by reference.
      </p>

      {/* ── 10 ──────────────────────────────────────────────────────── */}
      <h2 id="disclaimers">10. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED <strong>"AS IS"</strong> AND <strong>"AS AVAILABLE"</strong>,
        WITHOUT WARRANTY OF ANY KIND.
      </p>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LEDGIPROOF DISCLAIMS ALL WARRANTIES,
        EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
      </p>
      <ul>
        <li>Warranties of merchantability</li>
        <li>Fitness for a particular purpose</li>
        <li>Non-infringement</li>
        <li>Accuracy, completeness, or reliability of the Service</li>
        <li>Uninterrupted, error-free, or secure operation</li>
      </ul>

      {/* ── 11 ──────────────────────────────────────────────────────── */}
      <h2 id="liability">11. Limitation of Liability</h2>

      <h3>11.1 Cap on Damages</h3>
      <p>
        OUR TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE
        WILL NOT EXCEED THE GREATER OF:
      </p>
      <ul>
        <li><strong>The amounts you paid to us in the twelve (12) months preceding the event</strong>, or</li>
        <li><strong>One hundred US dollars ($100)</strong></li>
      </ul>

      <h3>11.2 Excluded Damages</h3>
      <p>IN NO EVENT WILL WE BE LIABLE FOR:</p>
      <ul>
        <li>Indirect, incidental, special, consequential, or punitive damages</li>
        <li>Loss of profits, revenue, business opportunities, or data</li>
        <li>Cost of substitute services</li>
        <li>Tax penalties, IRS audits, or fines incurred from incorrect data</li>
        <li>Damages arising from third-party services (including Plaid, your bank, or your payment processor)</li>
      </ul>

      {/* ── 12 ──────────────────────────────────────────────────────── */}
      <h2 id="indemnification">12. Indemnification</h2>
      <p>
        You agree to indemnify, defend, and hold harmless LedgiProof, Olympus Mont Systems LLC,
        and our officers, directors, employees, and agents from any claims, liabilities,
        damages, losses, costs, and expenses (including reasonable attorneys' fees) arising
        from:
      </p>
      <ul>
        <li>Your use of the Service in violation of these Terms</li>
        <li>Your violation of any third-party right</li>
        <li>Inaccurate, incomplete, or unlawful Data uploaded to the Service</li>
        <li>Your violation of any applicable law or regulation</li>
      </ul>

      {/* ── 13 ──────────────────────────────────────────────────────── */}
      <h2 id="termination">13. Termination</h2>

      <h3>13.1 By You</h3>
      <p>You may stop using the Service and cancel your subscription at any time through Settings → Billing.</p>

      <h3>13.2 By Us</h3>
      <p>We may suspend or terminate your access to the Service at any time, with or without notice, if:</p>
      <ul>
        <li>You violate these Terms or the Acceptable Use policy</li>
        <li>We are required to do so by law</li>
        <li>We discontinue the Service (with at least 60 days' notice)</li>
        <li>Your account remains inactive for more than 12 consecutive months</li>
        <li>Your payment is overdue and remains unpaid for more than 30 days after notice</li>
      </ul>

      <h3>13.3 Effect of Termination</h3>
      <p>Upon termination:</p>
      <ul>
        <li>Your right to access the Service ceases immediately</li>
        <li>Your account enters the 90-day grace period</li>
        <li>We will delete your data after the grace period, subject to legal retention requirements</li>
      </ul>

      {/* ── 14 ──────────────────────────────────────────────────────── */}
      <h2 id="modifications">14. Modifications to the Service and Terms</h2>
      <p>We reserve the right to:</p>
      <ul>
        <li>Add, remove, or modify features at any time</li>
        <li>Modify these Terms with at least <strong>30 days' email notice</strong></li>
        <li>Change pricing for new subscriptions immediately, and for existing subscriptions with 30 days' notice</li>
      </ul>

      {/* ── 15 ──────────────────────────────────────────────────────── */}
      <h2 id="governing-law">15. Governing Law and Dispute Resolution</h2>

      <h3>15.1 Governing Law</h3>
      <p>
        These Terms are governed by the laws of the <strong>State of Maryland</strong>, USA,
        without regard to its conflict-of-laws principles. The federal and state courts located
        in Maryland will have exclusive jurisdiction over any dispute that is not subject to
        arbitration under Section 15.2.
      </p>

      <h3>15.2 Binding Arbitration</h3>
      <p>
        For disputes that cannot be resolved through good-faith negotiation, you and we agree
        to resolve disputes through <strong>binding arbitration</strong> administered by the
        American Arbitration Association (AAA) under its Commercial Arbitration Rules, with
        the arbitration to take place in Maryland.
      </p>

      <h3>15.3 Class Action Waiver</h3>
      <div className="legal-callout">
        <div className="legal-callout-title">⚠️ Class Action Waiver</div>
        YOU AND WE EACH AGREE THAT DISPUTES WILL BE RESOLVED ONLY ON AN INDIVIDUAL BASIS AND
        NOT AS A CLASS, COLLECTIVE, OR REPRESENTATIVE ACTION.
      </div>

      <h3>15.4 Exceptions</h3>
      <p>The arbitration requirement does not apply to:</p>
      <ul>
        <li>Claims for injunctive relief related to intellectual property infringement</li>
        <li>Claims that may be brought in small-claims court (subject to that court's jurisdictional limits)</li>
      </ul>

      <h3>15.5 Opt-Out of Arbitration</h3>
      <p>
        You may opt out of the arbitration agreement by sending written notice to{' '}
        <a href="mailto:support@ledgiproof.com?subject=Arbitration%20Opt-Out">support@ledgiproof.com</a>{' '}
        with the subject "Arbitration Opt-Out" within 30 days of first accepting these Terms.
      </p>

      {/* ── 16 ──────────────────────────────────────────────────────── */}
      <h2 id="miscellaneous">16. Miscellaneous</h2>

      <h3>16.1 Entire Agreement</h3>
      <p>
        These Terms, the Privacy Policy, and any additional terms expressly referenced
        constitute the entire agreement between you and LedgiProof regarding the Service.
      </p>

      <h3>16.2 Severability</h3>
      <p>
        If any provision of these Terms is held invalid or unenforceable, the remaining
        provisions will remain in full effect.
      </p>

      <h3>16.3 No Waiver</h3>
      <p>
        Our failure to enforce any provision of these Terms is not a waiver of our right to do
        so later.
      </p>

      <h3>16.4 Assignment</h3>
      <p>
        You may not assign or transfer these Terms without our prior written consent. We may
        assign these Terms freely as part of a merger, acquisition, or sale of assets.
      </p>

      <h3>16.5 Force Majeure</h3>
      <p>
        We are not liable for any failure or delay in performance caused by circumstances
        beyond our reasonable control (natural disasters, war, terrorism, pandemic, internet
        outages, third-party service failures, etc.).
      </p>

      <h3>16.6 Notices</h3>
      <p>
        We will send notices to the email address associated with your account. You must keep
        your email address current. Notices are deemed received the day after sending.
      </p>
      <p>For legal notices to LedgiProof:</p>
      <p>
        <strong>Olympus Mont Systems LLC</strong><br />
        Attn: Legal<br />
        Email: <a href="mailto:support@ledgiproof.com">support@ledgiproof.com</a>
      </p>

      {/* ── 17 ──────────────────────────────────────────────────────── */}
      <h2 id="contact">17. Contact</h2>
      <p>Questions about these Terms?</p>
      <p>
        <strong>Olympus Mont Systems LLC</strong><br />
        Email: <a href="mailto:support@ledgiproof.com">support@ledgiproof.com</a><br />
        Maryland Department ID: W26738385<br />
        Website: <a href="https://ledgiproof.com">ledgiproof.com</a>
      </p>

    </LegalPageLayout>
  )
}