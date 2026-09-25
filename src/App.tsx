// PATH: src/App.tsx
//
// Public-aware router:
//   /             → LandingPage (public)
//   /pricing      → Pricing (public)
//   /login        → Login (public, but redirects authenticated users)
//   /signup       → SignUp (public, accepts ?plan=X&type=Y)
//   /accept-invite/:token        → AcceptInvite (logged-out path)
//   /accept-client-portal/:token → AcceptClientPortalInvite
//
//   Authenticated routes (gated by session):
//   /             → AppShell with Dashboard (overrides landing when logged in)
//   /admin        → SuperAdmin (super_admin only)
//   /client/*     → ClientPortalShell (client_user only — see existing logic)

import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import { useOrgStore } from './store/org.store'
import { useClientPortalStore } from './store/client-portal.store'
import { useImpersonationStore } from './store/impersonation.store'
import { useSessionRevocationGuard } from './hooks/useSessionRevocationGuard'
import i18n from './i18n'

// Eager on purpose: the app shells, route guards, and the landing / login /
// MFA screens — the first paint for logged-out visitors and the sign-in flow.
// Every other page is its own on-demand chunk via lazyPage() (see
// lib/lazy-page.tsx), so first load no longer downloads the whole app.
import AppShell from './components/layout/AppShell'
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import MfaVerify from './pages/MfaVerify'
import { lazyPage } from './lib/lazy-page'

const Pricing                 = lazyPage(() => import('./pages/Pricing'))
const SignUp                  = lazyPage(() => import('./pages/SignUp'))
const ForgotPassword          = lazyPage(() => import('./pages/ForgotPassword'))
const ResetPassword           = lazyPage(() => import('./pages/ResetPassword'))
const AcceptInvite            = lazyPage(() => import('./pages/AcceptInvite'))
const AcceptClientPortalInvite = lazyPage(() => import('./pages/AcceptClientPortalInvite'))
const StaffActivatePage       = lazyPage(() => import('./pages/StaffActivatePage'))
const ClientPortalActivatePage = lazyPage(() => import('./pages/ClientPortalActivatePage'))
const OnboardingWizard        = lazyPage(() => import('./pages/OnboardingWizard'))
const Dashboard               = lazyPage(() => import('./pages/Dashboard'))
const Transactions            = lazyPage(() => import('./pages/Transactions'))
const Reconciliation          = lazyPage(() => import('./pages/Reconciliation'))
const Invoices                = lazyPage(() => import('./pages/Invoices'))
const Estimates               = lazyPage(() => import('./pages/Estimates'))
const EstimateEdit            = lazyPage(() => import('./pages/EstimateEdit'))
const EstimatePublic          = lazyPage(() => import('./pages/EstimatePublic'))
const W9Public                = lazyPage(() => import('./pages/W9Public'))
const InvoicePublic           = lazyPage(() => import('./pages/InvoicePublic'))
const Clients                 = lazyPage(() => import('./pages/Clients'))
const Notes                   = lazyPage(() => import('./pages/Notes'))
const Vendors                 = lazyPage(() => import('./pages/Vendors'))
const Worksheet1099           = lazyPage(() => import('./pages/Worksheet1099'))
const EditClientPage          = lazyPage(() => import('./pages/EditClientPage'))
const PymeClients             = lazyPage(() => import('./pages/pyme/PymeClients'))
const Team                    = lazyPage(() => import('./pages/Team'))
const ImportData              = lazyPage(() => import('./pages/ImportData'))
const ImportChartOfAccounts   = lazyPage(() => import('./pages/import/ImportChartOfAccounts'))
const ImportCustomers         = lazyPage(() => import('./pages/import/ImportCustomers'))
const ImportOpeningBalances   = lazyPage(() => import('./pages/import/ImportOpeningBalances'))
const ImportBankTransactions  = lazyPage(() => import('./pages/import/ImportBankTransactions'))
const BankImports             = lazyPage(() => import('./pages/BankImports'))
const ChartOfAccounts         = lazyPage(() => import('./pages/ChartOfAccounts'))
const Payroll                 = lazyPage(() => import('./pages/Payroll'))
const Time                    = lazyPage(() => import('./pages/Time'))
const Checklists              = lazyPage(() => import('./pages/Checklists'))
const Reports                 = lazyPage(() => import('./pages/Reports'))
const FirmReportsSummary      = lazyPage(() => import('./pages/FirmReportsSummary'))
const Settings                = lazyPage(() => import('./pages/Settings'))
const BillingSuccess          = lazyPage(() => import('./pages/BillingSuccess'))
const JournalEntries          = lazyPage(() => import('./pages/JournalEntries'))
const PeriodControls          = lazyPage(() => import('./pages/PeriodControls'))

// Legal pages (public, standalone layout — reachable logged-in or out).
// Canonical paths match the cross-links inside LegalPageLayout.
const PrivacyPolicyPage       = lazyPage(() => import('./pages/legal/PrivacyPolicyPage'))
const TermsOfServicePage      = lazyPage(() => import('./pages/legal/TermsOfServicePage'))
const DPAPage                 = lazyPage(() => import('./pages/legal/DPAPage'))
const CookiesPolicyPage       = lazyPage(() => import('./pages/legal/CookiesPolicyPage'))
const PlaidDisclosurePage     = lazyPage(() => import('./pages/legal/PlaidDisclosurePage'))

// (Messages and ClientMessages replaced by GlobalChatBubble + MessagesRedirect)

// 🆕 A3.2 (D2): Client portal shell + pages (were never connected to App.tsx)
import ClientPortalShell    from './components/layout/ClientPortalShell'
import PortalShell          from './components/layout/PortalShell'
const PortalOverview        = lazyPage(() => import('./pages/portal/PortalOverview'))
const PortalDocuments       = lazyPage(() => import('./pages/portal/PortalDocuments'))
const PortalInvoices        = lazyPage(() => import('./pages/portal/PortalInvoices'))
const ClientDashboard       = lazyPage(() => import('./pages/client/ClientDashboard'))
const ClientConnectBank     = lazyPage(() => import('./pages/client/ClientConnectBank'))
const ClientTransactions    = lazyPage(() => import('./pages/client/ClientTransactions'))
const ClientInvoices        = lazyPage(() => import('./pages/client/ClientInvoices'))
const ClientAccountSettings = lazyPage(() => import('./pages/client/ClientAccountSettings'))
const SuperAdmin            = lazyPage(() => import('./components/admin/SuperAdmin'))
import SemaphoreSpinner from './components/ui/SemaphoreSpinner'
import DropZone from './components/upload/DropZone'
import ErrorBoundary from './components/error/ErrorBoundary'
import RoleGuard from './components/auth/RoleGuard'
import Unauthorized from './pages/Unauthorized'

// 🆕 Client Switcher Sprint 2 — Foundation + Routing
import FirmRouteRedirect       from './components/auth/FirmRouteRedirect'
import ClientContextRoute      from './components/layout/ClientContextRoute'
const ClientWorkspaceOverview = lazyPage(() => import('./pages/ClientWorkspaceOverview'))
const ClientDocuments         = lazyPage(() => import('./pages/ClientDocuments'))

// ── Spinner (branded — 4 semaphore colors) ────────────────────────────────
// Thin wrapper kept for backward compatibility with existing call sites.
function Spinner({ label }: { label: string }) {
  return <SemaphoreSpinner label={label} />
}

// ── MessagesRedirect ──────────────────────────────────────────────────────
// Replaces the old /messages and /client/messages full-page routes.
// Opens the floating GlobalChatBubble and redirects to the home page.
import { useChatBubbleStore } from './store/chat-bubble.store'

function MessagesRedirect() {
  const { openChat } = useChatBubbleStore()
  useEffect(() => { openChat() }, [openChat])
  return <Navigate to="/" replace />
}

// ── ReportsEntry ──────────────────────────────────────────────────────────
// Top-level /reports has no :clientId — self-mode orgs (solo/pyme/
// bookkeeper-personal) always render their own single-entity Reports here,
// same as before. Firm orgs land here with no clientId (the nested
// /clients/:clientId/reports route is the only way a firm user ever gets
// one) — this used to just bounce to /clients via FirmRouteRedirect since
// there was nothing firm-level to show. Now it renders the firm-wide
// per-client comparison table instead.
import { useScope } from './hooks/useScope'

function ReportsEntry() {
  const scope = useScope()
  if (!scope.isReady) return <Spinner label="Loading…" />
  return scope.scopeMode === 'firm-client'
    ? <ErrorBoundary section="firm reports"><FirmReportsSummary /></ErrorBoundary>
    : <ErrorBoundary section="reports"><Reports /></ErrorBoundary>
}

// ── Legal routes (shared by public + authenticated routers) ─────────────────
// Standalone public pages (LegalPageLayout provides its own chrome). Rendered
// as a fragment so both <Routes> trees mount the exact same paths, matching the
// cross-links defined inside LegalPageLayout (/legal/privacy, /legal/terms, …).
function legalRoutes() {
  return (
    <>
      <Route path="legal/privacy"          element={<PrivacyPolicyPage />} />
      <Route path="legal/terms"            element={<TermsOfServicePage />} />
      <Route path="legal/dpa"              element={<DPAPage />} />
      <Route path="legal/cookies"          element={<CookiesPolicyPage />} />
      <Route path="legal/plaid-disclosure" element={<PlaidDisclosurePage />} />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const { initialize, session, profile, loading: authLoading, mfaPending } = useAuthStore()
  const { loadOrgs, loading: orgLoading, orgs, error: orgError } = useOrgStore()
  const { syncActorFromAuth, exitAdminView, isImpersonating } = useImpersonationStore()
  const { loadMemberships, loading: portalLoading, memberships: portalMemberships } = useClientPortalStore()

  // 🆕 Realtime session revocation — active for every authenticated render,
  // staff (AppShell) and client (ClientPortalShell) alike, since this
  // component is the shared ancestor of both. No-ops internally while
  // there's no session yet.
  useSessionRevocationGuard()

  // 1. Init auth
  useEffect(() => { initialize() }, [initialize])

  // 2. Load orgs when authenticated
  useEffect(() => {
    if (session?.user?.id) loadOrgs(session.user.id)
  }, [session?.user?.id, loadOrgs])

  // 2b. Sync in-app language with the profile's saved preference — covers a
  // new device/session where the localStorage mirror (src/i18n/index.ts)
  // doesn't match the real saved choice yet.
  useEffect(() => {
    if (profile?.locale && profile.locale !== i18n.language) {
      i18n.changeLanguage(profile.locale)
      try { localStorage.setItem('lp-locale', profile.locale) } catch { /* best-effort mirror only */ }
    }
  }, [profile?.locale])

  // 2a. Once signed in, warm the chunks of the pages people open most while
  // the browser is idle — the first click on them then resolves instantly
  // instead of waiting on a network round trip (see lib/lazy-page.tsx).
  useEffect(() => {
    if (!session?.user?.id) return
    const warm = () => [Transactions, Invoices, Clients, Reports, Settings, Estimates]
      .forEach(page => page.preload())
    const ric = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined
    if (ric) {
      const id = ric(warm, { timeout: 4000 })
      return () => (window as any).cancelIdleCallback?.(id)
    }
    const t = setTimeout(warm, 2000)
    return () => clearTimeout(t)
  }, [session?.user?.id])

  // 2b. Load client-portal memberships in parallel — a person invited to a
  // firm's client portal has zero organization_memberships rows by design
  // (see client-portal.store.ts), so this is the only way App.tsx can tell
  // them apart from someone with no access at all vs. someone who belongs
  // in the portal router instead of OnboardingWizard.
  useEffect(() => {
    if (session?.user?.id) loadMemberships(session.user.id)
  }, [session?.user?.id, loadMemberships])

  // 3. Sync impersonation actor + clean if not super_admin
  useEffect(() => {
    if (!session?.user) return
    if (!profile)       return
    syncActorFromAuth()
    if (profile.system_role !== 'super_admin') {
      exitAdminView()
    }
  }, [session?.user?.id, profile?.system_role, syncActorFromAuth, exitAdminView])

  // ── Loading states ─────────────────────────────────────────────────────
  if (authLoading) return <Spinner label="Loading LedgiProof…" />
  if (mfaPending)  return <MfaVerify />

  // ── Public router (no session) ─────────────────────────────────────────
  if (!session) {
    return <PublicRouter />
  }

  // ── Authenticated: org loading ─────────────────────────────────────────
  if (orgLoading || portalLoading) return <Spinner label="Loading your workspace…" />

  if (orgError) {
    return (
      <div style={{
        height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--lp-bg)', padding: 40
      }}>
        <div style={{
          maxWidth: 440,
          background: 'var(--lp-surface)',
          border: '0.5px solid rgba(239,68,68,0.3)',
          borderRadius: 12, padding: 24
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>
            Could not load workspace
          </div>
          <div style={{
            fontSize: 13, color: 'var(--lp-text-muted)',
            marginBottom: 16, fontFamily: 'monospace'
          }}>
            {orgError}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="lp-btn lp-btn-ghost"
            style={{ justifyContent: 'center', width: '100%' }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Onboarding ─────────────────────────────────────────────────────────
  // 🆕 View As: support@ledgiproof.com has zero orgs of its own by design
  // (see handle_new_user()). While NOT impersonating, that's the reduced
  // admin-only tree below. But once they click "View as Org/User", the
  // full tree must be available — Dashboard/Transactions/etc — so
  // navigating to '/' actually renders the target's real dashboard
  // instead of bouncing back to /admin via the catch-all route.
  if (orgs.length === 0 && !isImpersonating()) {
    // Super admin without workspace → goes straight to /admin
    if (profile?.system_role === 'super_admin') {
      return (
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <DropZone />
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index           element={<Navigate to="/admin" replace />} />
              <Route path="admin"    element={
                <ErrorBoundary section="admin"><SuperAdmin /></ErrorBoundary>
              } />
              <Route path="settings" element={
                <ErrorBoundary section="settings"><Settings /></ErrorBoundary>
              } />
              <Route path="unauthorized" element={<Unauthorized />} />
            </Route>
            {/* Password recovery — accessible from any authenticated state */}
            <Route path="reset-password" element={<ResetPasswordRoute />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </BrowserRouter>
      )
    }
    // A person invited to a firm's client portal never gets an org
    // membership (that's by design — see client-portal.store.ts), so
    // without this check they'd fall through to OnboardingWizard, which
    // tries to walk them through creating an organization — nonsensical
    // for someone who's just here to view numbers, exchange documents,
    // and chat with their bookkeeper.
    if (portalMemberships.length > 0) {
      return (
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/portal" element={<PortalShell />}>
              <Route index             element={<PortalOverview />} />
              <Route path="documents"  element={<PortalDocuments />} />
              <Route path="invoices"   element={<PortalInvoices />} />
            </Route>
            <Route path="reset-password" element={<ResetPasswordRoute />} />
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Routes>
        </BrowserRouter>
      )
    }
    return <OnboardingWizard />
  }

  // ── Authenticated full app ─────────────────────────────────────────────
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DropZone />
      <Routes>
        {/* Public routes redirect to / when authenticated */}
        <Route path="/login"          element={<Navigate to="/" replace />} />
        <Route path="/signup"         element={<Navigate to="/" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/" replace />} />
        <Route path="/pricing"        element={<Navigate to="/settings?tab=billing" replace />} />
        {/* Reset password — Supabase may redirect here while already logged in.
            Allow it through so the user can set their new password. */}
        <Route path="/reset-password" element={<ResetPasswordRoute />} />

        <Route path="accept-invite/:token"        element={<AcceptInviteRoute />} />
        <Route path="accept-client-portal/:token" element={<AcceptClientPortalInviteRoute />} />
        <Route path="staff-activate/:token"        element={<StaffActivateRoute />} />
        <Route path="client-portal-activate/:token" element={<ClientPortalActivatePage />} />

        {/* Public estimate link — works even when authenticated (standalone layout) */}
        <Route path="e/:token" element={<EstimatePublic />} />
        <Route path="w9/:token" element={<W9Public />} />
        <Route path="i/:token" element={<InvoicePublic />} />

        {/* Legal pages — standalone, reachable while authenticated too */}
        {legalRoutes()}

        {/* App */}
        <Route path="/" element={<AppShell />}>
          <Route index                element={
            <ErrorBoundary section="dashboard"><Dashboard /></ErrorBoundary>
          } />

          {/* 🆕 Client Switcher — Raw operational routes are wrapped with
              FirmRouteRedirect. For bookkeeper firm users, this redirects
              to /clients (Decision 2: solo Dashboard y /clients work without
              scope). SOLO/PYME/bookkeeper-personal pass through normally. */}
          <Route path="transactions"  element={
            <FirmRouteRedirect>
              <ErrorBoundary section="transactions"><Transactions /></ErrorBoundary>
            </FirmRouteRedirect>
          } />
          <Route path="reconciliation" element={
            <FirmRouteRedirect>
              <ErrorBoundary section="reconciliation"><Reconciliation /></ErrorBoundary>
            </FirmRouteRedirect>
          } />
          <Route path="invoices"      element={
            <FirmRouteRedirect>
              <ErrorBoundary section="invoices"><Invoices /></ErrorBoundary>
            </FirmRouteRedirect>
          } />
          <Route path="estimates"     element={
            <FirmRouteRedirect>
              <ErrorBoundary section="estimates"><Estimates /></ErrorBoundary>
            </FirmRouteRedirect>
          } />
          <Route path="estimates/:id" element={
            <FirmRouteRedirect>
              <ErrorBoundary section="estimate editor"><EstimateEdit /></ErrorBoundary>
            </FirmRouteRedirect>
          } />
          <Route path="clients"       element={
            <ErrorBoundary section="clients"><Clients /></ErrorBoundary>
          } />
          <Route path="notes"         element={
            <ErrorBoundary section="notes"><Notes /></ErrorBoundary>
          } />

          {/* 1099 Fase 1 — Vendor (payee) management */}
          <Route path="vendors"       element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin', 'bookkeeper_staff',
              'accountant_owner', 'accountant_admin', 'accountant_staff',
              'solo_owner', 'pyme_owner'
            ]}>
              <ErrorBoundary section="vendors"><Vendors /></ErrorBoundary>
            </RoleGuard>
          } />

          {/* 1099 Fase 3 — Worksheet acumulado por vendor/año */}
          <Route path="reports/1099"  element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin', 'bookkeeper_staff',
              'accountant_owner', 'accountant_admin', 'accountant_staff',
              'solo_owner', 'pyme_owner'
            ]}>
              <ErrorBoundary section="1099-worksheet"><Worksheet1099 /></ErrorBoundary>
            </RoleGuard>
          } />

          {/* 🆕 P4 Fase 2.A — Dedicated client edit page */}
          <Route path="clients/:id/edit" element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin',
              'accountant_owner', 'accountant_admin'
            ]}>
              <ErrorBoundary section="edit-client"><EditClientPage /></ErrorBoundary>
            </RoleGuard>
          } />

          {/* 🆕 P4: Team management page (separate from billing clients) */}
          <Route path="team"          element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin',
              'accountant_owner', 'accountant_admin'
            ]}>
              <ErrorBoundary section="team"><Team /></ErrorBoundary>
            </RoleGuard>
          } />

          {/* 🆕 P4 Fase 2.D — PYME-side customer management.
              PYME owners manage THEIR billing customers here.
              The bookkeeper has their own equivalent at /clients (this page
              is intentionally NOT for bookkeepers). */}
          <Route path="pyme/clients" element={
            <RoleGuard allowed={[
              'pyme_owner', 'pyme_staff'
            ]}>
              <ErrorBoundary section="pyme-clients"><PymeClients /></ErrorBoundary>
            </RoleGuard>
          } />

          {/* 🆕 P-Import.A: Import Data wizard landing + sub-routes
              (sub-wizards live at /import/chart-of-accounts, etc — implemented
              in Import.B and Import.C; for now they redirect back to /import) */}
          <Route path="import"        element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin', 'bookkeeper_staff',
              'accountant_owner', 'accountant_admin', 'accountant_staff',
              'solo_owner', 'pyme_owner'
            ]}>
              <ErrorBoundary section="import"><ImportData /></ErrorBoundary>
            </RoleGuard>
          } />

          {/* 🆕 Bank transactions import (CSV/OFX) — available to all client
              roles (solo, bookkeeper, accountant, pyme). Each row becomes a
              transaction through the semaphore engine. Firm scope via ?clientId. */}
          <Route path="import/bank-transactions" element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin', 'bookkeeper_staff',
              'accountant_owner', 'accountant_admin', 'accountant_staff',
              'solo_owner', 'pyme_owner'
            ]}>
              <ErrorBoundary section="import-bank-transactions">
                <ImportBankTransactions />
              </ErrorBoundary>
            </RoleGuard>
          } />

          {/* 🆕 P-Import.B: Chart of Accounts wizard (4 steps) */}
          <Route path="import/chart-of-accounts" element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin',
              'accountant_owner', 'accountant_admin'
            ]}>
              <ErrorBoundary section="import-coa">
                <ImportChartOfAccounts />
              </ErrorBoundary>
            </RoleGuard>
          } />

          {/* 🆕 P-Import.C: Customers wizard (4 steps) */}
          <Route path="import/customers" element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin',
              'accountant_owner', 'accountant_admin'
            ]}>
              <ErrorBoundary section="import-customers">
                <ImportCustomers />
              </ErrorBoundary>
            </RoleGuard>
          } />

          {/* 🆕 P-Import.D: Opening Balances wizard (4 steps, strict validation) */}
          <Route path="import/opening-balances" element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin',
              'accountant_owner', 'accountant_admin'
            ]}>
              <ErrorBoundary section="import-opening-balances">
                <ImportOpeningBalances />
              </ErrorBoundary>
            </RoleGuard>
          } />

          {/* /messages → redirect to home and open the floating chat bubble */}
          <Route path="messages" element={<MessagesRedirect />} />

          <Route path="imports"       element={
            <FirmRouteRedirect>
              <ErrorBoundary section="bank imports"><BankImports /></ErrorBoundary>
            </FirmRouteRedirect>
          } />
          <Route path="accounts"      element={
            <FirmRouteRedirect>
              <ErrorBoundary section="chart of accounts"><ChartOfAccounts /></ErrorBoundary>
            </FirmRouteRedirect>
          } />
          <Route path="reports"       element={<ReportsEntry />} />
          <Route path="time"          element={
            <FirmRouteRedirect>
              <ErrorBoundary section="time tracking"><Time /></ErrorBoundary>
            </FirmRouteRedirect>
          } />
          <Route path="checklists"    element={
            <FirmRouteRedirect>
              <ErrorBoundary section="checklists"><Checklists /></ErrorBoundary>
            </FirmRouteRedirect>
          } />

          {/* 🆕 LedgiProof Payroll — VA/MD/DC/PA/DE/WV launch scope, Solo
              profile excluded (RoleGuard omits solo_owner). Bookkeeper/
              accountant firm users still go through FirmRouteRedirect to
              pick a client first, same as accounts/transactions/reports. */}
          <Route path="payroll"       element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin', 'bookkeeper_staff',
              'accountant_owner', 'accountant_admin', 'accountant_staff',
              'pyme_owner', 'pyme_staff'
            ]}>
              <FirmRouteRedirect>
                <ErrorBoundary section="payroll"><Payroll /></ErrorBoundary>
              </FirmRouteRedirect>
            </RoleGuard>
          } />

          <Route path="settings"      element={
            <ErrorBoundary section="settings"><Settings /></ErrorBoundary>
          } />

          <Route path="billing/success" element={
            <ErrorBoundary section="billing"><BillingSuccess /></ErrorBoundary>
          } />

          {/* Admin route — gated by RoleGuard (super_admin only) */}
          <Route path="admin" element={
            <RoleGuard allowed={['super_admin']}>
              <ErrorBoundary section="admin"><SuperAdmin /></ErrorBoundary>
            </RoleGuard>
          } />

          {/* 🆕 Client Switcher — Sprint 2 (Routing)
              Nested workspace routes for bookkeeper AND accountant firm context.
              The :clientId param scopes ALL operations to that client.
              RoleGuard restricts to bookkeeper/accountant firm roles.
              ClientContextRoute hydrates the client + renders the banner. */}
          <Route path="clients/:clientId" element={
            <RoleGuard allowed={[
              'bookkeeper_owner', 'bookkeeper_admin', 'bookkeeper_staff',
              'accountant_owner', 'accountant_admin', 'accountant_staff'
            ]}>
              <ClientContextRoute />
            </RoleGuard>
          }>
            <Route index                element={
              <ErrorBoundary section="client overview"><ClientWorkspaceOverview /></ErrorBoundary>
            } />
            <Route path="transactions"  element={
              <ErrorBoundary section="client transactions"><Transactions /></ErrorBoundary>
            } />
            <Route path="reconciliation" element={
              <ErrorBoundary section="client reconciliation"><Reconciliation /></ErrorBoundary>
            } />
            <Route path="invoices"      element={
              <ErrorBoundary section="client invoices"><Invoices /></ErrorBoundary>
            } />
            <Route path="documents"     element={
              <ErrorBoundary section="client documents"><ClientDocuments /></ErrorBoundary>
            } />
            <Route path="estimates"     element={
              <ErrorBoundary section="client estimates"><Estimates /></ErrorBoundary>
            } />
            <Route path="estimates/:id" element={
              <ErrorBoundary section="client estimate editor"><EstimateEdit /></ErrorBoundary>
            } />
            <Route path="imports"       element={
              <ErrorBoundary section="client bank imports"><BankImports /></ErrorBoundary>
            } />
            <Route path="accounts"      element={
              <ErrorBoundary section="client chart of accounts"><ChartOfAccounts /></ErrorBoundary>
            } />
            <Route path="reports"       element={
              <ErrorBoundary section="client reports"><Reports /></ErrorBoundary>
            } />
            <Route path="time"          element={
              <ErrorBoundary section="client time tracking"><Time /></ErrorBoundary>
            } />
            <Route path="checklists"    element={
              <ErrorBoundary section="client checklists"><Checklists /></ErrorBoundary>
            } />
            <Route path="payroll"       element={
              <ErrorBoundary section="client payroll"><Payroll /></ErrorBoundary>
            } />
            <Route path="journal"       element={
              <ErrorBoundary section="journal entries"><JournalEntries /></ErrorBoundary>
            } />
            <Route path="periods"       element={
              <ErrorBoundary section="period controls"><PeriodControls /></ErrorBoundary>
            } />
          </Route>

          {/* Fallback for unauthorized access attempts */}
          <Route path="unauthorized" element={<Unauthorized />} />
        </Route>

        {/* 🆕 A3.2 (D2): Client Portal — separate shell from AppShell.
            Restricted by ClientPortalShell internally (it checks isClient || impersonating).
            These routes were previously orphaned: components existed but no route mounted them. */}
        <Route path="/client" element={
          <RoleGuard allowed={[
            'pyme_owner', 'pyme_staff',
            'super_admin'  // super_admin reaches /client only via impersonation
          ]}>
            <ClientPortalShell />
          </RoleGuard>
        }>
          <Route index                element={
            <ErrorBoundary section="client dashboard"><ClientDashboard /></ErrorBoundary>
          } />
          {/* /client/messages → redirect and open the floating chat bubble */}
          <Route path="messages" element={<MessagesRedirect />} />
          <Route path="bank"          element={
            <ErrorBoundary section="client bank"><ClientConnectBank /></ErrorBoundary>
          } />
          <Route path="transactions"  element={
            <ErrorBoundary section="client transactions"><ClientTransactions /></ErrorBoundary>
          } />
          <Route path="invoices"      element={
            <ErrorBoundary section="client invoices"><ClientInvoices /></ErrorBoundary>
          } />
          <Route path="settings"      element={
            <ErrorBoundary section="client settings"><ClientAccountSettings /></ErrorBoundary>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTER (no session)
// ─────────────────────────────────────────────────────────────────────────────

function PublicRouter() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/"         element={<LandingPage />} />
        <Route path="/pricing"  element={<Pricing />} />
        <Route path="/login"    element={<LoginRoute />} />
        <Route path="/signup"   element={<SignUpRoute />} />
        <Route path="accept-invite/:token"        element={<AcceptInviteRoute />} />
        <Route path="accept-client-portal/:token" element={<AcceptClientPortalInviteRoute />} />
        <Route path="staff-activate/:token"        element={<StaffActivateRoute />} />
        <Route path="client-portal-activate/:token" element={<ClientPortalActivatePage />} />
        {/* Password reset flow — accessible without a session */}
        <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
        <Route path="/reset-password"  element={<ResetPasswordRoute />} />
        {/* Public estimate link (no auth required) */}
        <Route path="e/:token"  element={<EstimatePublic />} />
        {/* Legal pages — public, no auth required */}
        {legalRoutes()}
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// ── Wrapper to give Login/SignUp the navigate callbacks they expect ─────────

function LoginRoute() {
  const navigate = useNavigate()
  return (
    <Login
      // Real bug fixed 2026-09-24: this dropped client_invite/invite query
      // params entirely, so a genuinely-new invitee who clicked "Sign up"
      // from the login page (see AcceptClientPortalInvite.tsx's own fix,
      // same day) landed on a bare /signup with no memory of which
      // invitation brought them here. Forward the same search string.
      onGoToSignUp={() => navigate(`/signup${window.location.search}`)}
      onGoToForgotPassword={() => navigate('/forgot-password')}
    />
  )
}

function ForgotPasswordRoute() {
  const navigate = useNavigate()
  return <ForgotPassword onBack={() => navigate('/login')} />
}

function ResetPasswordRoute() {
  const navigate = useNavigate()
  return <ResetPassword onDone={() => navigate('/login')} />
}

function SignUpRoute() {
  const navigate = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const inviteToken = params.get('invite') ?? undefined
  const clientInviteToken = params.get('client_invite') ?? undefined
  return (
    <SignUp
      onGoToLogin={() => navigate('/login')}
      {...(inviteToken       ? { inviteToken }       : {})}
      {...(clientInviteToken ? { clientInviteToken } : {})}
    />
  )
}

function AcceptInviteRoute() {
  return <AcceptInvite />
}

function AcceptClientPortalInviteRoute() {
  return <AcceptClientPortalInvite />
}

function StaffActivateRoute() {
  return <StaffActivatePage />
}
