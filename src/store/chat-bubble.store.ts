// PATH: src/store/chat-bubble.store.ts
//
// Global state for the floating GlobalChatBubble.
// Any component in the app can call openChat(clientId?) to open the bubble
// focused on a specific client's conversation, replacing navigate('/messages').

import { create } from 'zustand'

interface ChatBubbleState {
  open:          boolean
  focusClientId: string | null
  openChat:      (clientId?: string | null) => void
  closeChat:     () => void
}

export const useChatBubbleStore = create<ChatBubbleState>((set) => ({
  open:          false,
  focusClientId: null,

  openChat: (clientId = null) => set({ open: true, focusClientId: clientId ?? null }),
  closeChat:              ()  => set({ open: false, focusClientId: null }),
}))
