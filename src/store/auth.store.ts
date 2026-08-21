// PATH: src/store/auth.store.ts
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Session, User } from '@supabase/supabase-js'
import type {
  Profile,
  OrganizationMembership,
  AccountType,
  SubscriptionPlan
} from '../types/database.types'

interface MfaFactor {
  id: string
  type: string
  status: string
}

// ── SignUp options ───────────────────────────────────────────────────────────
// Backward-compatible: signUp can be called with (email, password, name) and
// defaults to self_employed + starter. New flows pass accountType + plan from
// the Pricing page.
export interface SignUpOptions {
  accountType?: AccountType
  plan?:        SubscriptionPlan
  // Pre-filled invite tokens (when arriving from /accept-* routes)
  inviteToken?: string | null
  clientInviteToken?: string | null
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  membership: OrganizationMembership | null
  loading: boolean
  error: string | null

  // 2FA
  mfaPending: boolean
  mfaFactorId: string | null

  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    email: string,
    password: string,
    name: string,
    options?: SignUpOptions
  ) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  verifyMfa: (code: string) => Promise<void>
  enrollMfa: () => Promise<{ qrCode: string; secret: string; factorId: string } | null>
  confirmMfaEnrollment: (factorId: string, code: string) => Promise<void>
  disableMfa: (factorId: string, totpCode: string) => Promise<void>
  getMfaFactors: () => Promise<MfaFactor[]>
  setMembership: (m: OrganizationMembership | null) => void
  clearError: () => void
}

// StrictMode (and Fast Refresh) double-invokes mount effects, so
// `initialize()` — called from an effect with no cleanup — genuinely runs
// twice per real mount in dev. Each run used to register its own
// onAuthStateChange subscription AND make its own redundant getSession()
// call, so a fresh page load could produce multiple concurrent
// handleSession() calls. Each one snapshots `isSameUser` independently; any
// call whose snapshot landed before `user` was first set reads
// isSameUser=false and nulls out membership on completion. If one of those
// resolved AFTER org.store's loadOrgs() had already set membership
// correctly, it silently wiped it back to null — permanently hiding every
// owner/admin-gated control (e.g. "+ Invite to portal" in Clients.tsx)
// despite the user genuinely having that role. Guarding initialize() to run
// once removes the redundant calls entirely instead of trying to out-race them.
let initialized = false

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  membership: null,
  loading: true,
  error: null,
  mfaPending: false,
  mfaFactorId: null,

  // ── Initialize ──────────────────────────────────────────────────────────
  initialize: async () => {
    if (initialized) return
    initialized = true

    set({ loading: true })

    // 🐛 Regression found and reverted: an earlier version of this fix
    // dropped the direct getSession()+handleSession() call entirely,
    // reasoning that onAuthStateChange's immediate INITIAL_SESSION fire made
    // it redundant. Verified live that's not reliably true — supabase-js
    // emits that one-shot INITIAL_SESSION event based on its own internal
    // session-hydration timing, not on listener-registration order; if this
    // subscription attaches even slightly after that internal check
    // resolves, the event is gone and nothing is ever received — the app
    // hangs at loading:true forever on a real, valid session (reproduced:
    // a fresh page load with a valid persisted session never left the
    // loading screen). The direct call below is the reliable path; the
    // idempotency guard above (not present in the original code) is what
    // actually fixes the original race — running this exactly once removes
    // the redundant *duplicate* calls that raced each other, without
    // removing the one call this needs to be reliable.
    const { data: { session: initialSession } } = await supabase.auth.getSession()
    if (initialSession) {
      await handleSession(initialSession, set, get)
    } else {
      set({ loading: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await handleSession(session, set, get)
      } else {
        set({
          session: null,
          user: null,
          profile: null,
          membership: null,
          loading: false,
          mfaPending: false,
          mfaFactorId: null
        })
      }
    })
  },

  // ── Sign in ─────────────────────────────────────────────────────────────
  signIn: async (email, password) => {
    set({ loading: true, error: null })

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      set({ loading: false, error: error.message })
      return
    }

    // Check if user has MFA enrolled
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const verifiedFactor = factors?.totp?.find(f => f.status === 'verified')

    if (verifiedFactor) {
      set({
        session: data.session,
        user: data.user,
        profile: null,
        membership: null,
        mfaPending: true,
        mfaFactorId: verifiedFactor.id,
        loading: false
      })
      return
    }

    const profile = data.user ? await fetchProfile(data.user.id) : null

    set({
      session: data.session,
      user: data.user,
      profile,
      membership: null,
      loading: false,
      mfaPending: false,
      mfaFactorId: null
    })
  },

  // ── Verify MFA OTP ──────────────────────────────────────────────────────
  verifyMfa: async (code: string) => {
    set({ loading: true, error: null })

    const factorId = get().mfaFactorId
    if (!factorId) {
      set({ loading: false, error: 'No MFA factor found' })
      return
    }

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId })

    if (challengeError) {
      set({ loading: false, error: challengeError.message })
      return
    }

    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code
    })

    if (error) {
      set({ loading: false, error: 'Invalid code — try again' })
      return
    }

    // 🐛 Real bug fixed: AuthMFAVerifyResponseData has no `session` field
    // (only flat access_token/refresh_token/user) — supabase.auth.mfa.verify()
    // already updates the client's internal session as a side effect, so we
    // re-read it via getSession() instead of the nonexistent `data.session`.
    const { data: { session } } = await supabase.auth.getSession()
    const profile = data.user ? await fetchProfile(data.user.id) : null

    set({
      session,
      user: data.user,
      profile,
      membership: null,
      mfaPending: false,
      mfaFactorId: null,
      loading: false
    })
  },

  // ── Enroll new MFA factor ───────────────────────────────────────────────
  enrollMfa: async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })

    if (error || !data) return null

    return {
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      factorId: data.id
    }
  },

  // ── Confirm enrollment (verify first code) ─────────────────────────────
  confirmMfaEnrollment: async (factorId: string, code: string) => {
    set({ error: null })

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId })

    if (challengeError) {
      set({ error: challengeError.message })
      return
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code
    })

    if (error) {
      set({ error: 'Invalid code — check your authenticator app' })
      return
    }
  },

  disableMfa: async (factorId: string, totpCode: string) => {
    set({ loading: true, error: null })

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId })

    if (challengeError) {
      set({ loading: false, error: challengeError.message })
      throw challengeError
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: totpCode
    })

    if (verifyError) {
      set({ loading: false, error: 'Invalid code — check your authenticator app' })
      throw verifyError
    }

    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    set({ loading: false })
    if (error) {
      set({ error: error.message })
      throw error
    }
  },

  getMfaFactors: async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    return (data?.totp ?? []).map(f => ({
      id: f.id,
      type: f.factor_type,
      status: f.status
    }))
  },

  // ── Sign up ─────────────────────────────────────────────────────────────
  // Now supports accountType + plan to create the right subscription
  // automatically when the email is auto-confirmed (no email verification flow).
  // If email confirmation is required, the subscription is created in
  // initialize/handleSession after the user clicks the confirmation link.
  signUp: async (email, password, displayName, options = {}) => {
    set({ loading: true, error: null })

    const accountType = options.accountType ?? 'self_employed'
    const plan        = options.plan        ?? planForAccountType(accountType)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name:         displayName,
          account_type: accountType,
          // Stashed in raw_user_meta_data for the trigger handle_new_user
          // to read and persist on the profile + subscription
          intended_plan: plan,
          // Tells handle_new_user() to skip its org/subscription bootstrap
          // for this signup — a client accepting a firm's portal invite gets
          // their access entirely through client_portal_users (set up by
          // accept_client_portal_invitation right after this), not a
          // personal org. Without this flag every pyme_client signup — invited
          // or not — got an auto-created "X's workspace" org + owner
          // membership regardless, which routed invited clients into the
          // full staff AppShell (MFA gate included) instead of the portal.
          ...(options.clientInviteToken ? { is_client_portal_invite: true } : {})
        }
      }
    })

    if (error) {
      set({ loading: false, error: error.message })
      return { needsConfirmation: false }
    }

    const needsConfirmation = !data.session

    if (data.session && data.user) {
      // Email auto-confirmed — finish setup immediately
      try {
        await ensureSubscription(data.user.id, accountType, plan)
        await ensureProfileAccountType(data.user.id, accountType)
      } catch (err) {
        // Soft-fail: trigger may have already created defaults; log only
        console.warn('[signUp] post-create setup warning:', err)
      }

      const profile = await fetchProfile(data.user.id)
      set({
        session: data.session,
        user: data.user,
        profile,
        membership: null,
        loading: false,
        mfaPending: false,
        mfaFactorId: null
      })
    } else {
      // Email confirmation flow — defer subscription creation until first login
      set({
        loading: false,
        membership: null
      })
    }

    return { needsConfirmation }
  },

  // ── Sign out ────────────────────────────────────────────────────────────
  signOut: async () => {
    await supabase.auth.signOut()
    set({
      session: null,
      user: null,
      profile: null,
      membership: null,
      loading: false,
      mfaPending: false,
      mfaFactorId: null,
      error: null
    })
  },

  setMembership: (m) => set({ membership: m }),

  clearError: () => set({ error: null })
}))

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

async function handleSession(
  session: Session,
  set: (s: Partial<AuthState>) => void,
  get: () => AuthState
) {
  // 🐛 Real bug fixed: supabase-js's onAuthStateChange fires on every session
  // event for the SAME user too — not just sign-in — including INITIAL_SESSION
  // (on every page load where a session already exists) and background
  // TOKEN_REFRESHED. This function used to unconditionally reset `membership`
  // to null on every one of those calls. org.store's loadOrgs() correctly
  // populates membership shortly after mount, but if one of these same-user
  // auth events resolved AFTER that (a real, easily-hit race — both fire on
  // every fresh page load), it silently wiped membership back to null with
  // nothing left to re-fetch it, permanently hiding every owner/admin-gated
  // control (e.g. "+ Invite to portal" in Clients.tsx) despite the user
  // genuinely having that role. Only reset membership when the user actually
  // changed (real sign-in as someone else) — preserve it across same-user
  // session refreshes by omitting the key so Zustand's shallow merge leaves
  // the existing value alone.
  const isSameUser = get().user?.id === session.user.id

  const profile = await fetchProfile(session.user.id)

  // If the user has no subscription yet (first login after email confirmation),
  // create a default one based on their profile.account_type
  if (profile) {
    await ensureSubscriptionExists(session.user.id, profile)
  }

  set({
    session,
    user: session.user,
    profile,
    ...(isSameUser ? {} : { membership: null }),
    loading: false,
    mfaPending: false,
    mfaFactorId: null
  })
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  return (data as Profile | null) ?? null
}

// ── Subscription helpers ────────────────────────────────────────────────────

function planForAccountType(t: AccountType): SubscriptionPlan {
  switch (t) {
    case 'bookkeeper':    return 'bookkeeper'  // 15-day trial
    case 'accountant':    return 'accountant'  // 15-day trial — CPA/accountant firm
    case 'self_employed': return 'starter'
    case 'pyme_client':   return 'starter'  // free, paid by inviting bookkeeper
    default:              return 'starter'
  }
}

async function ensureSubscription(
  userId: string,
  accountType: AccountType,
  _plan: SubscriptionPlan  // kept for call-site compat; plan is now derived server-side
): Promise<void> {
  // Plan is determined by the SECURITY DEFINER function — caller cannot supply it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)('create_initial_subscription', {
    p_user_id:      userId,
    p_account_type: accountType
  })
}

async function ensureProfileAccountType(
  userId: string,
  accountType: AccountType
): Promise<void> {
  // Update profile.account_type if it doesn't match (trigger may have set default)
  await supabase
    .from('profiles')
    .update({ account_type: accountType })
    .eq('id', userId)
}

async function ensureSubscriptionExists(
  userId: string,
  profile: Profile
): Promise<void> {
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return  // good

  // First login after email confirmation — create from profile defaults
  const accountType = (profile.account_type as AccountType) ?? 'self_employed'
  const plan = planForAccountType(accountType)
  await ensureSubscription(userId, accountType, plan)
}
