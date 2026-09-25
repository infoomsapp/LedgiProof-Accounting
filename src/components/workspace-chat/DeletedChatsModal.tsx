// PATH: src/components/workspace-chat/DeletedChatsModal.tsx
//
// Read-only browser over workspace_conversation_archives -- the permanent
// snapshot deleteWorkspaceConversation() always writes before it deletes a
// conversation's live rows. Staff-only (owner/admin), matching who can
// delete a conversation in the first place. Two levels: a list of past
// deletions for this org, and a transcript view for one of them with the
// same "download as .txt" export the still-live chat panel offers.

import { useState, useEffect, useCallback } from 'react'
import Modal   from '../ui/modal'
import Icon    from '../ui/Icon'
import {
  listConversationArchives,
  getConversationArchive,
  type ConversationArchiveSummary,
  type ConversationArchiveDetail,
} from '../../services/workspace-chat.service'
import { toSafeMessage } from '../../lib/errors'

interface Props {
  open:  boolean
  onClose: () => void
  orgId: string
}

function downloadArchiveTranscript(archive: ConversationArchiveDetail) {
  const lines = [
    `LedgiProof chat export — ${archive.client_name ?? 'client'} (deleted conversation)`,
    `Originally deleted ${new Date(archive.deleted_at).toLocaleString()} by ${archive.deleted_by_name ?? 'unknown'}`,
    `Exported ${new Date().toLocaleString()}`,
    '',
    ...archive.snapshot.map(m => {
      const who  = m.sender_name ?? (m.sender_role === 'bookkeeper' ? 'Firm' : 'Client')
      const when = new Date(m.created_at).toLocaleString()
      const body = m.body ?? (m.document_filename ? `[attachment: ${m.document_filename}]` : '')
      return `[${when}] ${who}: ${body}`
    }),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `chat-${(archive.client_name ?? 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-deleted-${archive.deleted_at.slice(0, 10)}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function DeletedChatsModal({ open, onClose, orgId }: Props) {
  const [list,    setList]    = useState<ConversationArchiveSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [detail,  setDetail]  = useState<ConversationArchiveDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setList(await listConversationArchives(orgId))
    } catch (e) {
      setError(toSafeMessage(e, 'Could not load deleted conversations'))
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (open) { setDetail(null); void load() }
  }, [open, load])

  async function openDetail(archiveId: string) {
    setDetailLoading(true)
    setError(null)
    try {
      setDetail(await getConversationArchive(archiveId))
    } catch (e) {
      setError(toSafeMessage(e, 'Could not load this deleted conversation'))
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={detail ? `Deleted: ${detail.client_name ?? 'client'}` : 'Deleted conversations'}
      width={560}
      {...(detail ? {} : { subtitle: 'A permanent record kept for every conversation deleted from this workspace — visible to owners and admins only.' })}
      {...(detail ? {
        footer: (
          <>
            <button className="lp-btn lp-btn-ghost" onClick={() => setDetail(null)}>← Back to list</button>
            <button className="lp-btn lp-btn-primary" onClick={() => downloadArchiveTranscript(detail)}>Download .txt</button>
          </>
        )
      } : {})}
    >
      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 7, fontSize: 12.5, color: 'var(--sem-red)',
          background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)', marginBottom: 12
        }}>
          {error}
        </div>
      )}

      {detail ? (
        <div style={{
          maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
          padding: '4px 2px'
        }}>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginBottom: 4 }}>
            Deleted {new Date(detail.deleted_at).toLocaleString()} by {detail.deleted_by_name ?? 'unknown'} ·{' '}
            {detail.message_count} message{detail.message_count === 1 ? '' : 's'}
          </div>
          {detail.snapshot.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', textAlign: 'center', padding: 20 }}>
              This conversation had no messages.
            </div>
          ) : detail.snapshot.map(m => (
            <div key={m.id} style={{
              padding: '8px 11px', borderRadius: 8,
              background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--lp-text)' }}>
                  {m.sender_name ?? (m.sender_role === 'bookkeeper' ? 'Firm' : 'Client')}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', flexShrink: 0 }}>
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--lp-text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {m.body ?? (m.document_filename ? `📎 ${m.document_filename}` : '—')}
              </div>
            </div>
          ))}
        </div>
      ) : loading ? (
        <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', textAlign: 'center', padding: 24 }}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <Icon name="archive" size={26} style={{ color: 'var(--lp-text-muted)', marginBottom: 10 }} />
          <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>No conversation has ever been deleted in this workspace.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
          {list.map(a => (
            <button
              key={a.id}
              onClick={() => openDetail(a.id)}
              disabled={detailLoading}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, textAlign: 'left',
                background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)',
                cursor: detailLoading ? 'default' : 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--chat-row-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)' }}>{a.client_name ?? '(unnamed client)'}</div>
                <div style={{ fontSize: 11, color: 'var(--lp-text-muted)' }}>
                  Deleted {new Date(a.deleted_at).toLocaleDateString()} by {a.deleted_by_name ?? 'unknown'} · {a.message_count} msg{a.message_count === 1 ? '' : 's'}
                </div>
              </div>
              <Icon name="search" size={13} style={{ color: 'var(--lp-text-muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
