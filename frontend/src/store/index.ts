import { create } from 'zustand'

interface Account {
  id: number
  of_user_id: string
  username: string
  display_name?: string
  avatar_url?: string
  last_synced_at?: string
}

interface User {
  id: number
  email: string
  username: string
  persona?: string
}

interface WsMessage {
  id: string
  fan_id: string
  from_creator: boolean
  content?: string | null
  media_urls?: unknown[]
  price?: number | null
  sent_at: string
  is_read: boolean
}

interface AppState {
  user: User | null
  accounts: Account[]
  activeAccountId: number | null
  activeFanId: string | null
  activeFanName: string | null
  activeFanAvatar: string | null
  isTypingToActiveFan: boolean   // creator typing → sends indicator TO fan
  fanTypingIds: string[]         // fans currently typing TO us
  fanOnlineIds: string[]         // fans currently online
  lastWsMessage: WsMessage | null
  lastDeletedMessageId: string | null
  lastDeletedFanId: string | undefined
  setUser: (u: User | null) => void
  setAccounts: (a: Account[]) => void
  setActiveAccount: (id: number) => void
  setActiveFan: (id: string | null, name?: string, avatar?: string) => void
  setIsTypingToActiveFan: (typing: boolean) => void
  setFanTyping: (fanId: string, typing: boolean) => void
  setFanOnline: (fanId: string, online: boolean) => void
  setLastWsMessage: (msg: WsMessage) => void
  setDeletedMessageId: (msgId: string, fanId?: string) => void
}

export const useStore = create<AppState>((set) => ({
  user: null,
  accounts: [],
  activeAccountId: null,
  activeFanId: null,
  activeFanName: null,
  activeFanAvatar: null,
  isTypingToActiveFan: false,
  fanTypingIds: [],
  fanOnlineIds: [],
  lastWsMessage: null,
  lastDeletedMessageId: null,
  lastDeletedFanId: undefined,
  setUser: (user) => set({ user }),
  setAccounts: (accounts) => set({ accounts }),
  setActiveAccount: (id) => set({ activeAccountId: id, activeFanId: null, activeFanName: null, activeFanAvatar: null }),
  setActiveFan: (id, name, avatar) => set({ activeFanId: id, activeFanName: name ?? null, activeFanAvatar: avatar ?? null, isTypingToActiveFan: false }),
  setIsTypingToActiveFan: (typing) => set({ isTypingToActiveFan: typing }),
  setFanTyping: (fanId, typing) => set((state) => ({
    fanTypingIds: typing
      ? [...new Set([...state.fanTypingIds, fanId])]
      : state.fanTypingIds.filter((id) => id !== fanId),
  })),
  setFanOnline: (fanId, online) => set((state) => ({
    fanOnlineIds: online
      ? [...new Set([...state.fanOnlineIds, fanId])]
      : state.fanOnlineIds.filter((id) => id !== fanId),
  })),
  setLastWsMessage: (msg) => set({ lastWsMessage: msg }),
  setDeletedMessageId: (msgId, fanId) => set({ lastDeletedMessageId: msgId, lastDeletedFanId: fanId }),
}))
