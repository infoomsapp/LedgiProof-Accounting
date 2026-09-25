// PATH: src/components/workspace-chat/AuditedStatusCheck.tsx
//
// The read-receipt mark for your own messages: a full circle outline while
// sent-but-unread, with the check drawing itself inside the moment the
// other side reads it. Slack/Teams' continuous-microinteraction pattern
// (the mark stays put and gains detail) rather than WhatsApp's abrupt
// icon swap -- fits an audit-focused product better than a blunt
// grey-to-blue flip. Matches the mobile app's own AuditedStatusCheck
// (CustomPainter) exactly, including the color choice below.
//
// pathLength="1" on the check path lets stroke-dasharray/-dashoffset work
// in unit terms (0..1) regardless of the actual geometry. Pure CSS
// transition, no JS animation loop, no library.

// Deliberately its own color, not var(--lp-accent) -- the user's own
// reference image and the LedgiProof-labeled default in their sample code
// agree on this exact blue, and it's kept distinct from --lp-accent on
// purpose: this app's accent visually reads as ControlMiles' own brand
// blue (a separate product), and this mark shouldn't borrow that identity.
const AUDITED_CHECK_BLUE = '#007AFF'

interface Props {
  read: boolean
  size?: number
  activeColor?: string
  pendingColor?: string
}

export default function AuditedStatusCheck({
  read, size = 15, activeColor = AUDITED_CHECK_BLUE, pendingColor = 'var(--chat-timestamp)'
}: Props) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      style={{ display: 'inline-block', verticalAlign: 'middle', overflow: 'visible' }}
      aria-label={read ? 'Read' : 'Delivered'}
      role="img"
    >
      {/* Always a full circle -- only its color changes on read, never its
          sweep. What appears/disappears is the check inside it. */}
      <circle
        cx="12" cy="12" r="9.5"
        fill="none"
        stroke={read ? activeColor : pendingColor}
        strokeWidth="2.4"
        style={{ transition: 'stroke 200ms ease-out' }}
      />
      <path
        d="M7.2 12.6 L10.4 16 L17 9"
        fill="none"
        stroke={activeColor}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={read ? 0 : 1}
        style={{
          transition: read
            ? 'stroke-dashoffset 320ms ease-in-out 80ms'
            : 'stroke-dashoffset 100ms ease-in',
        }}
      />
    </svg>
  )
}
