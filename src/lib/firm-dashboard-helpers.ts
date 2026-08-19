// PATH: src/lib/firm-dashboard-helpers.ts
//
// Shared builders for the firm dashboards (Bookkeeper + Accountant). Extracted
// to kill the ~90% copy-paste between the two pages. Pure mapping only — every
// number already comes computed from the get_bookkeeper_dashboard RPC; these
// helpers just reshape the DTO into the widgets' item types (Constitution: no
// UI aggregation).

import type {
  BookkeeperDashboardData,
  FirmFinancialKpis
} from '../services/bookkeeper-dashboard.service'
import type { AttentionItem } from '../components/dashboard/v2/shared/AttentionGrid'
import type { PendingDocItem } from '../components/dashboard/v2/shared/PendingDocsCard'
import type { ActivityItem } from '../components/dashboard/v2/shared/ActivitySidebar'
import type { AuditActivityItem } from '../types/audit'
import { auditActionLabel, auditActionIcon } from '../types/audit'

// ── Attention items ──────────────────────────────────────────────────────────
// `clientsPath` is where firm-scoped items route (always /clients). Bookkeeper
// and Accountant pass the same today, but keeping it a param avoids baking a
// route into shared code.
export function buildAttentionItems(
  data: BookkeeperDashboardData | null | undefined,
  onNavigate: (path: string) => void,
  clientsPath = '/clients'
): AttentionItem[] {
  const items: AttentionItem[] = []
  if (!data) return items

  const k  = data.kpis
  const fk = data.financial_kpis

  if (k.pending_red > 0) {
    items.push({
      key: 'pending_red', count: k.pending_red,
      label: 'Critical Pending', severity: 'critical',
      onClick: () => onNavigate(clientsPath)
    })
  }
  if (k.pending_amber > 0) {
    items.push({
      key: 'pending_amber', count: k.pending_amber,
      label: 'Pending Review', severity: 'warning',
      onClick: () => onNavigate(clientsPath)
    })
  }
  if (k.unreconciled > 0) {
    items.push({
      key: 'unreconciled', count: k.unreconciled,
      label: 'Unreconciled', severity: 'warning',
      onClick: () => onNavigate(clientsPath)
    })
  }
  if (fk && fk.overdue_invoices > 0) {
    items.push({
      key: 'overdue_invoices', count: fk.overdue_count,
      label: 'Overdue Invoices', severity: 'critical',
      onClick: () => onNavigate(clientsPath)
    })
  }
  return items
}

export function criticalCount(items: AttentionItem[]): number {
  return items
    .filter(i => i.severity === 'critical')
    .reduce((s, i) => s + i.count, 0)
}

// ── Pending documents (amber/red recent activity) ────────────────────────────
export function buildPendingDocItems(
  data:            BookkeeperDashboardData | null | undefined,
  defaultCurrency: string = 'USD',
): PendingDocItem[] {
  return (data?.recent_activity ?? [])
    .filter(t => t.semaphore === 'amber' || t.semaphore === 'red')
    .map(t => ({
      transaction_id:   t.tx_id,
      transaction_date: t.created_at.slice(0, 10),
      merchant:         null,
      description:      t.description,
      amount:           t.amount,
      currency:         defaultCurrency,
      semaphore:        t.semaphore as 'amber' | 'red',
      client_id:        t.client_id,
      client_name:      t.client_name
    }))
}

// ── Activity feed (audit events → colored items) ─────────────────────────────
export function buildActivityItems(events: AuditActivityItem[]): ActivityItem[] {
  return events.map((ev) => {
    const color = ev.action?.includes('delete') || ev.action?.includes('reject')
      ? 'red'
      : ev.action?.includes('approve') || ev.action?.includes('paid')
      ? 'green'
      : ev.action?.includes('upload') || ev.action?.includes('attach')
      ? 'blue'
      : ev.action?.includes('flag') || ev.action?.includes('warn')
      ? 'amber'
      : ev.action?.includes('send') || ev.action?.includes('estimate')
      ? 'purple'
      : 'gray'

    return {
      key:   ev.id,
      color: color as ActivityItem['color'],
      text:  `${auditActionIcon(ev.action)} ${auditActionLabel(ev.action)}`,
      sub:   ev.actor_name ?? (ev.description ? ev.description.slice(0, 32) : 'System'),
      at:    ev.created_at
    }
  })
}

// ── FirmHealthKpis prop mapping (from SQL-computed financial_kpis) ───────────
export function firmHealthProps(fk: FirmFinancialKpis | undefined) {
  return {
    monthIncome:        fk?.income_verified   ?? 0,
    monthExpenses:      fk?.expenses_verified ?? 0,
    monthIncomeCount:   fk?.income_count      ?? 0,
    monthExpensesCount: fk?.expense_count     ?? 0,
    cashFlow:           fk?.cash_flow_verified ?? 0,
    outstandingTotal:   fk?.outstanding_invoices ?? 0,
    overdueCount:       fk?.overdue_count     ?? 0
  }
}
