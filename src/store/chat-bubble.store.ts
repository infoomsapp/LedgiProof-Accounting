// PATH: src/store/chat-bubble.store.ts
//
// Global state for the floating GlobalChatBubble.
// Any component in the app can call openChat(clientId?, tab?) to open the
// bubble focused on a specific client's conversation (and optionally land
// directly on a specific tab, e.g. a note_reminder notification deep-linking
// straight to Notes instead of just the inbox), replacing navigate('/messages').

import { create } from 'zustand'

export type ChatFocusTab = 'chat' | 'summary' | 'files' | 'requests' | 'notes'

interface ChatBubbleState {
  open:          boolean
  focusClientId: string | null
  focusTab:      ChatFocusTab | null
  openChat:      (clientId?: string | null, tab?: ChatFocusTab | null) => void
  closeChat:     () => void
}

export const useChatBubbleStore = create<ChatBubbleState>((set) => ({
  open:          false,
  focusClientId: null,
  focusTab:      null,

  openChat: (clientId = null, tab = null) => set({ open: true, focusClientId: clientId ?? null, focusTab: tab ?? null }),
  closeChat:              ()  => set({ open: false, focusClientId: null, focusTab: null }),
}))
