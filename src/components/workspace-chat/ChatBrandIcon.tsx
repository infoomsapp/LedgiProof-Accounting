// PATH: src/components/workspace-chat/ChatBrandIcon.tsx
//
// The chat feature's own mark -- a speech bubble carrying four dots in
// LedgiProof's OWN semaphore palette (--sem-blue/green/amber/red, the same
// tokens the transaction semaphore and the chat bubble's own priority ring
// already use), not a generic four-color scheme. Deliberately NOT run
// through Icon.tsx: every icon there is a single-color outline glyph by
// design, and this one is a small multi-color brand mark for the one or two
// places chat introduces itself (the floating bubble, the empty-inbox
// state) -- not a generic list icon.

interface Props {
  size?: number
}

export default function ChatBrandIcon({ size = 24 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill="#5FC6EA" />
      <path d="M18 30 L14 36 L23 30 Z" fill="#FFFFFF" />
      <rect x="10" y="14" width="28" height="16" rx="8" fill="#FFFFFF" />
      <circle cx="15" cy="22" r="2.3" fill="var(--sem-blue)" />
      <circle cx="21" cy="22" r="2.3" fill="var(--sem-green)" />
      <circle cx="27" cy="22" r="2.3" fill="var(--sem-amber)" />
      <circle cx="33" cy="22" r="2.3" fill="var(--sem-red)" />
    </svg>
  )
}
