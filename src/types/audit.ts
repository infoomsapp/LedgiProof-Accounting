// PATH: src/types/audit.ts
//
// Strict types for audit events and audit-related data.
// Replaces (ev: any) in BookkeeperDashboard, ReadOnlyDashboard, audit views.
//
// NOTE: validate these against your actual audit_events schema. The fields
// here reflect what send_transaction_message / register_document write plus
// common columns. If a column name differs, fix it HERE (single source).

export type SemaphoreStatus = 'blue' | 'green' | 'amber' | 'red'

export type AuditAction =
  | 'message.sent'
  | 'document.uploaded'
  | 'document.deleted'
  | 'transaction.categorized'
  | 'transaction.reviewed'
  | 'transaction.approved'
  | 'review.opened'
  | 'review.resolved'
  | 'review.expired'
  | 'member.invited'
  | 'member.role_changed'
  | string   // allow forward-compat with new actions

export interface AuditEvent {
  id:           string
  org_id:       string
  actor_id:     string | null
  actor_name?:  string | null
  action:       AuditAction
  entity_type:  string          // 'transaction' | 'document' | 'transaction_message' | ...
  entity_id:    string | null
  metadata:     Record<string, unknown>
  created_at:   string
}

// ── Recent audit activity item (as returned by get_recent_admin_events
//    or get_audit_transaction_activity) ─────────────────────────────────────
export interface AuditActivityItem {
  id:               string
  action:           AuditAction
  entity_type:      string
  entity_id:        string | null
  actor_name:       string | null
  actor_role?:      string | null
  transaction_id?:  string | null
  description?:     string | null
  created_at:       string
  metadata?:        Record<string, unknown>
}

// ── Audit transaction row (ReadOnlyDashboard / AuditTransactionsTable) ───────
export interface AuditTransactionRow {
  id:               string
  transaction_date: string
  description:      string | null
  merchant:         string | null
  amount:           number
  currency:         string          // ccy
  semaphore:        SemaphoreStatus
  requires_review:  boolean
  client_id:        string | null
  client_name?:     string | null
  category?:        string | null
  created_at:       string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'message.sent':              'Message sent',
  'document.uploaded':         'Document uploaded',
  'document.deleted':          'Document deleted',
  'transaction.categorized':   'Transaction categorized',
  'transaction.reviewed':      'Transaction reviewed',
  'transaction.approved':      'Transaction approved',
  'review.opened':             'Review opened',
  'review.resolved':           'Review resolved',
  'review.expired':            'Review expired',
  'member.invited':            'Member invited',
  'member.role_changed':       'Role changed'
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ')
}

// ── i18n variant ─────────────────────────────────────────────────────────────
// Parallel map of the same actions to i18n keys. Kept SEPARATE from
// AUDIT_ACTION_LABELS above (which stays the untranslated source of truth for
// any non-React caller) so translating the activity feed can't regress it.
// Unknown/forward-compat actions fall back to the same prettified string.
export const AUDIT_ACTION_LABEL_KEYS: Record<string, string> = {
  'message.sent':              'audit.actions.messageSent',
  'document.uploaded':         'audit.actions.documentUploaded',
  'document.deleted':          'audit.actions.documentDeleted',
  'transaction.categorized':   'audit.actions.transactionCategorized',
  'transaction.reviewed':      'audit.actions.transactionReviewed',
  'transaction.approved':      'audit.actions.transactionApproved',
  'review.opened':             'audit.actions.reviewOpened',
  'review.resolved':           'audit.actions.reviewResolved',
  'review.expired':            'audit.actions.reviewExpired',
  'member.invited':            'audit.actions.memberInvited',
  'member.role_changed':       'audit.actions.memberRoleChanged'
}

export function translateAuditAction(
  action: string,
  t: (key: string) => string
): string {
  const key = AUDIT_ACTION_LABEL_KEYS[action]
  return key ? t(key) : action.replace(/[._]/g, ' ')
}

export function auditActionIcon(action: string): string {
  if (action.startsWith('message'))     return '💬'
  if (action.startsWith('document'))    return '📎'
  if (action.startsWith('transaction')) return '💳'
  if (action.startsWith('review'))      return '⏰'
  if (action.startsWith('member'))      return '👤'
  return '•'
}