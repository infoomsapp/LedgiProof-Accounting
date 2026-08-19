// PATH: src/lib/commands.ts
//
// CQRS Command Registry — registers all command handlers at startup.
//
// Import this file ONCE at the app entry point (main.tsx) to ensure every
// handler is registered before any component dispatches a command:
//
//   import './lib/commands'
//
// ADDING A NEW COMMAND
//   1. Define the payload type here (or in the service file).
//   2. Call commandBus.register('domain.verb', handler).
//   3. Replace direct service calls in components with:
//        const { dispatch } = useCommand()
//        await dispatch('domain.verb', payload)
//
// HANDLER CONTRACT
//   Every handler returns CommandResult<T>:
//     { ok: true,  data: T }       — success
//     { ok: false, error: string } — failure (no throw)

import { commandBus }          from './command-bus'
import { markReadModelDirty }  from './read-model'
import type { CommandResult }  from './command-bus'

import {
  createTransaction,
  editTransaction,
  approveTransaction,
  type CreateTransactionInput,
  type EditTransactionInput,
  type ApproveTransactionInput,
} from '../services/transactions.service'
import type { Transaction } from '../types/database.types'

import {
  sendWorkspaceMessage,
  type SendWorkspaceMessageInput,
} from '../services/workspace-chat.service'

// ═════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═════════════════════════════════════════════════════════════════════════════

commandBus.register<CreateTransactionInput, Transaction>(
  'transaction.create',
  async (payload): Promise<CommandResult<Transaction>> => {
    try {
      const tx = await createTransaction(payload)
      return { ok: true, data: tx }
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
)

commandBus.register<EditTransactionInput, Transaction>(
  'transaction.edit',
  async (payload): Promise<CommandResult<Transaction>> => {
    try {
      const tx = await editTransaction(payload)
      markReadModelDirty(payload.orgId, [
        'accountant_dashboard', 'bookkeeper_dashboard',
        'firm_insights', 'solo_dashboard', 'pyme_dashboard',
      ])
      return { ok: true, data: tx }
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
)

commandBus.register<ApproveTransactionInput, void>(
  'transaction.approve',
  async (payload): Promise<CommandResult<void>> => {
    try {
      await approveTransaction(payload)
      markReadModelDirty(payload.orgId, ['accountant_dashboard', 'bookkeeper_dashboard', 'firm_insights'])
      return { ok: true, data: undefined }
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
)

// ═════════════════════════════════════════════════════════════════════════════
// WORKSPACE CHAT
// ═════════════════════════════════════════════════════════════════════════════

commandBus.register<SendWorkspaceMessageInput, void>(
  'workspace_chat.send',
  async (payload): Promise<CommandResult<void>> => {
    try {
      await sendWorkspaceMessage(payload)
      markReadModelDirty(payload.orgId, ['workspace_chat', 'bookkeeper_dashboard'])
      return { ok: true, data: undefined }
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
)

// ═════════════════════════════════════════════════════════════════════════════
// INVOICES
// ═════════════════════════════════════════════════════════════════════════════
// Add invoice commands here following the same pattern as transactions.
// Example:
//
// commandBus.register<CreateInvoiceInput, Invoice>(
//   'invoice.create',
//   async (payload) => {
//     const { createInvoice } = await import('../services/invoice.service')
//     try {
//       const inv = await createInvoice(payload)
//       markReadModelDirty(payload.orgId, ['bookkeeper_dashboard', 'firm_insights'])
//       return { ok: true, data: inv }
//     } catch (err: unknown) {
//       return { ok: false, error: err instanceof Error ? err.message : String(err) }
//     }
//   }
// )

// ── Registration complete ──────────────────────────────────────────────────────

if (import.meta.env.DEV) {
  console.debug('[CommandBus] Registered commands:', commandBus.registeredCommands())
}
