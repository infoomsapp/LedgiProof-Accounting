// PATH: src/store/impersonation.store.ts

import { create } from 'zustand'
import type { SystemRole } from '../types/database.types'

// 🔴 NUEVO
import { useAuthStore } from './auth.store'

export type ImpersonationMode = 'normal' | 'admin_view'

export interface ImpersonationContext {
  mode:            ImpersonationMode

  targetOrgId:     string | null
  targetClientId:  string | null
  targetUserId:    string | null

  targetOrgName:   string | null
  targetClientName: string | null
  targetUserName:  string | null

  actorRole:       SystemRole | null
  actorUserId:     string | null
}

interface ImpersonationState extends ImpersonationContext {
  enterAdminView: (context: {
    targetOrgId?:     string
    targetClientId?:  string
    targetUserId?:    string
    targetOrgName?:   string
    targetClientName?: string
    targetUserName?:  string
  }) => void

  exitAdminView:  () => void

  setActorRole:   (role: SystemRole | null, userId: string | null) => void

  // 🔴 NUEVO
  syncActorFromAuth: () => void

  isImpersonating: () => boolean
  getContextLabel: () => string
}

const INITIAL: ImpersonationContext = {
  mode:             'normal',
  targetOrgId:      null,
  targetClientId:   null,
  targetUserId:     null,
  targetOrgName:    null,
  targetClientName: null,
  targetUserName:   null,
  actorRole:        null,
  actorUserId:      null
}

// Impersonation state is kept in memory only (no sessionStorage persistence).
// Reason: sessionStorage is readable by any JS in the same tab — including XSS.
// On page reload the admin simply re-enters View As, which is expected UX.
export const useImpersonationStore = create<ImpersonationState>()((set, get) => ({

  ...INITIAL,

  enterAdminView: (context) => set({
    mode:             'admin_view',
    targetOrgId:      context.targetOrgId      ?? null,
    targetClientId:   context.targetClientId   ?? null,
    targetUserId:     context.targetUserId     ?? null,
    targetOrgName:    context.targetOrgName    ?? null,
    targetClientName: context.targetClientName ?? null,
    targetUserName:   context.targetUserName   ?? null
  }),

  exitAdminView: () => set({
    mode:             'normal',
    targetOrgId:      null,
    targetClientId:   null,
    targetUserId:     null,
    targetOrgName:    null,
    targetClientName: null,
    targetUserName:   null
  }),

  setActorRole: (role, userId) => set({
    actorRole: role,
    actorUserId: userId
  }),

  // 🔥 AUTO-SYNC CON AUTH
  syncActorFromAuth: () => {
    const auth = useAuthStore.getState()

    const systemRole = auth.profile?.system_role ?? null
    const userId     = auth.user?.id ?? null

    const current = get()

    // Solo setea si cambió
    if (
      current.actorRole !== systemRole ||
      current.actorUserId !== userId
    ) {
      set({
        actorRole: systemRole,
        actorUserId: userId
      })
    }
  },

  isImpersonating: () => get().mode === 'admin_view',

  getContextLabel: () => {
    const s = get()
    if (s.mode !== 'admin_view') return ''

    const parts: string[] = []
    if (s.targetClientName) parts.push(`Client: ${s.targetClientName}`)
    if (s.targetOrgName)    parts.push(`Org: ${s.targetOrgName}`)
    if (s.targetUserName)   parts.push(`User: ${s.targetUserName}`)

    return parts.join(' · ')
  }
}))