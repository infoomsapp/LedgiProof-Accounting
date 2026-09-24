// PATH: src/components/workspace-chat/messageTagStyle.ts
//
// The one place a message tag turns into color on the web — mirrors the
// mobile app's widgets/message_tag_style.dart exactly: same three semaphore
// colors (amber/green/red) plus the untagged default, same labels, same
// icons, same meaning on both platforms.

import type { IconName } from '../ui/Icon'
import type { MessageTag } from '../../services/workspace-chat.service'

export const TAG_COLORS: Record<MessageTag, { ink: string; bg: string; border: string }> = {
  normal:  { ink: 'var(--lp-accent)', bg: 'var(--sem-blue-bg)',  border: 'var(--sem-blue-border)' },
  pending: { ink: 'var(--sem-amber)', bg: 'var(--sem-amber-bg)', border: 'var(--sem-amber-border)' },
  invoice: { ink: 'var(--sem-green)', bg: 'var(--sem-green-bg)', border: 'var(--sem-green-border)' },
  urgent:  { ink: 'var(--sem-red)',   bg: 'var(--sem-red-bg)',   border: 'var(--sem-red-border)' },
}

export const TAG_LABELS: Record<MessageTag, string> = {
  normal:  'Message',
  pending: 'Outstanding',
  invoice: 'Invoice',
  urgent:  'Needs a reply',
}

export const TAG_ICONS: Record<MessageTag, IconName> = {
  normal:  'chat',
  pending: 'time',
  invoice: 'receipt',
  urgent:  'warning',
}
