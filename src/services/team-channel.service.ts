// PATH: src/services/team-channel.service.ts
// Wrappers around the team-channel RPCs: ONE channel per firm organization,
// visible only to the firm's own members (never clients). Text only. Every
// member -- owner and admin included -- deletes only their own messages.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'
import { dbError } from '../lib/errors'

export interface TeamMessage {
  id:          string
  sender_id:   string | null
  sender_name: string | null
  /** null once the sender deleted it. */
  body:        string | null
  created_at:  string
  is_deleted:  boolean
}

export interface TeamChannelPage {
  org_id:       string
  has_more:     boolean
  oldest_at:    string | null
  unread_count: number
  messages:     TeamMessage[]
}

export async function getTeamChannel(
  orgId:   string,
  limit  = 50,
  before?: string | null
): Promise<TeamChannelPage> {
  const { data, error } = await db.rpc('get_team_channel', pruneRpcArgs({
    p_org_id: orgId,
    p_limit:  limit,
    p_before: before ?? undefined
  }))
  if (error) throw dbError(error, 'Failed to load the team chat')
  return data as unknown as TeamChannelPage
}

export async function sendTeamMessage(orgId: string, body: string): Promise<void> {
  const { error } = await db.rpc('send_team_message', { p_org_id: orgId, p_body: body })
  if (error) throw dbError(error, 'Could not send the message')
}

export async function markTeamChannelRead(orgId: string): Promise<void> {
  const { error } = await db.rpc('mark_team_channel_read', { p_org_id: orgId })
  if (error) throw dbError(error, 'Could not mark the team chat as read')
}

export async function deleteTeamMessage(messageId: string): Promise<void> {
  const { error } = await db.rpc('delete_team_message', { p_message_id: messageId })
  if (error) throw dbError(error, 'Could not delete the message')
}
