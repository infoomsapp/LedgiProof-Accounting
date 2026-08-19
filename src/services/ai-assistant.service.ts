// PATH: src/services/ai-assistant.service.ts
//
// AI Assistant client with quota guard.
//
// 🔒 WIRING: Every AI call goes through runWithQuota('ai_queries').
//    - If user is at hard cap → throws QuotaExceededError
//    - If allowed → calls the edge function, then increments counter
//    - If the AI call fails → counter is NOT incremented
//
// Use this from ANY component that talks to the AI:
//   const reply = await askAi(orgId, "What was my Q1 net profit?")

import { db } from '../lib/supabase'
import { runWithQuota } from './quota.service'

export interface AiChatRequest {
  orgId:    string
  prompt:   string
  context?: {
    page?:        string
    selectedTx?:  string[]
    period?:      { year: number; month?: number; quarter?: number }
    [key: string]: any
  }
}

export interface AiChatResponse {
  reply:        string
  tokens_in?:   number
  tokens_out?:  number
  model?:       string
}

/**
 * Send a prompt to the AI assistant. Protected by quota.
 *
 * Throws:
 *   - QuotaExceededError when user is at hard cap (caller should show upgrade modal)
 *   - Error for any other failure (network, auth, model error)
 */
export async function askAi(req: AiChatRequest): Promise<AiChatResponse> {
  return runWithQuota(req.orgId, 'ai_queries', async () => {
    const { data: { session } } = await db.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const res = await db.functions.invoke('ai-query', {
      body: {
        org_id:  req.orgId,
        prompt:  req.prompt,
        context: req.context ?? {}
      },
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    if (res.error) throw new Error(res.error.message)
    const data = res.data as any
    if (data?.error) throw new Error(data.error)
    if (!data?.reply) throw new Error('AI returned no reply')

    return {
      reply:      data.reply,
      tokens_in:  data.tokens_in,
      tokens_out: data.tokens_out,
      model:      data.model
    }
  })
}

// ── Convenience: classify a single transaction ───────────────────────────────

export async function classifyTransaction(
  orgId: string,
  transactionId: string
): Promise<{ semaphore: 'blue' | 'green' | 'amber' | 'red'; reason: string }> {
  return runWithQuota(orgId, 'ai_queries', async () => {
    const { data: { session } } = await db.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const res = await db.functions.invoke('ai-classify-tx', {
      body: { org_id: orgId, transaction_id: transactionId },
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    if (res.error) throw new Error(res.error.message)
    return res.data as { semaphore: any; reason: string }
  })
}