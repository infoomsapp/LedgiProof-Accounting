// PATH: src/services/ai-assistant.service.ts
//
// AI Assistant client. The ai-query edge function checks the plan's AI
// quota, runs the query and counts it -- once, on the server. At the cap it
// answers 429, surfaced here as QuotaExceededError.
//
// Use this from ANY component that talks to the AI:
//   const reply = await askAi(orgId, "What was my Q1 net profit?")

import { db } from '../lib/supabase'
import { quotaErrorFromFunction } from './quota.service'
import { dbError } from '../lib/errors'

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
 * Send a prompt to the AI assistant (quota enforced by the edge function).
 *
 * Throws:
 *   - QuotaExceededError when user is at hard cap (caller should show upgrade modal)
 *   - Error for any other failure (network, auth, model error)
 */
export async function askAi(req: AiChatRequest): Promise<AiChatResponse> {
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

  if (res.error) {
    throw (await quotaErrorFromFunction(res.error, 'ai_queries'))
      ?? dbError(res.error, 'The assistant is unavailable right now')
  }
  const data = res.data as any
  if (data?.error) throw new Error(data.error)
  if (!data?.reply) throw new Error('AI returned no reply')

  return {
    reply:      data.reply,
    tokens_in:  data.tokens_in,
    tokens_out: data.tokens_out,
    model:      data.model
  }
}
