import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { getMessages, sendMessage, sendTypingIndicator } from '../../services/api'
import { useStore } from '../../store'
import SuggestionBar from './SuggestionBar'
import MessageBubble, { type Message } from './MessageBubble'
import Toolbar from './Toolbar'
import FanProfilePanel from '../FanProfile/FanProfilePanel'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

// ── Skeleton ──────────────────────────────────────────────────────────────────

const SKELETON_ROWS: Array<{ right: boolean; lines: string[] }> = [
  { right: false, lines: ['w-48', 'w-32'] },
  { right: true,  lines: ['w-36'] },
  { right: false, lines: ['w-56', 'w-44', 'w-20'] },
  { right: true,  lines: ['w-52', 'w-28'] },
  { right: false, lines: ['w-40'] },
  { right: true,  lines: ['w-44', 'w-36'] },
  { right: false, lines: ['w-48', 'w-40', 'w-24'] },
  { right: true,  lines: ['w-32', 'w-20'] },
]

function MessageSkeletons() {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {SKELETON_ROWS.map((row, i) => (
        <div key={i} className={`flex ${row.right ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[72%] rounded-2xl px-3 py-2.5 space-y-2 animate-pulse ${
              row.right ? 'bg-[#5c1030] rounded-br-sm' : 'bg-[#1e1e1e] rounded-bl-sm'
            }`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {row.lines.map((w, j) => (
              <div
                key={j}
                className={`h-2.5 rounded-full ${w} ${
                  row.right ? 'bg-[#8c1a48]' : 'bg-[#2a2a2a]'
                }`}
              />
            ))}
            <div className={`h-1.5 w-8 rounded-full ${row.right ? 'bg-[#8c1a48] ml-auto' : 'bg-[#252525]'}`} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Typing bubble ─────────────────────────────────────────────────────────────

function TypingBubble({ name, avatar }: { name: string; avatar?: string | null }) {
  return (
    <div className="flex items-end gap-2 px-4 py-2">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-[#2a2a2a] overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-gray-400">
        {avatar
          ? <img src={avatar} alt="" className="w-full h-full object-cover" />
          : name[0]?.toUpperCase()
        }
      </div>
      {/* Bubble + label */}
      <div className="flex flex-col gap-0.5">
        <div className="bg-[#1e1e1e] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-400" style={{ animation: 'typingBounce 1.2s infinite', animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-gray-400" style={{ animation: 'typingBounce 1.2s infinite', animationDelay: '200ms' }} />
          <span className="w-2 h-2 rounded-full bg-gray-400" style={{ animation: 'typingBounce 1.2s infinite', animationDelay: '400ms' }} />
        </div>
        <span className="text-[10px] text-gray-600 pl-1">{name} is typing...</span>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractMessages(raw: unknown): Message[] {
  if (Array.isArray(raw)) return raw as Message[]
  const r = raw as Record<string, unknown>
  const list = r.messages ?? r.items ?? r.data
  return Array.isArray(list) ? (list as Message[]) : []
}

function extractHasMore(raw: unknown): boolean {
  if (Array.isArray(raw)) return false
  return Boolean((raw as Record<string, unknown>).has_more)
}

// ── ChatView ──────────────────────────────────────────────────────────────────

export default function ChatView() {
  const {
    activeFanId,
    activeFanName,
    activeFanAvatar,
    activeAccountId,
    accounts,
    isTypingToActiveFan,
    fanTypingIds,
    fanOnlineIds,
    lastWsMessage,
    lastDeletedMessageId,
    lastDeletedFanId,
    setIsTypingToActiveFan,
  } = useStore()

  const [messages, setMessages]       = useState<Message[]>([])
  const [loading, setLoading]         = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore]         = useState(false)
  const [inputText, setInputText]     = useState('')
  const [sending, setSending]         = useState(false)
  const [showProfile, setShowProfile] = useState(true)

  const containerRef   = useRef<HTMLDivElement>(null)
  const bottomRef      = useRef<HTMLDivElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingRef     = useRef(false)   // mirror of `loading` for poll callback

  const loadingMoreRef = useRef(false)
  const hasMoreRef     = useRef(false)
  const messagesRef    = useRef<Message[]>([])
  const loadMoreFnRef  = useRef<() => void>(() => {})
  const restoreScrollRef = useRef<number | null>(null)

  const activeAccount = accounts.find((a) => a.id === activeAccountId)

  useEffect(() => { messagesRef.current    = messages    }, [messages])
  useEffect(() => { loadingMoreRef.current = loadingMore }, [loadingMore])
  useEffect(() => { hasMoreRef.current     = hasMore     }, [hasMore])
  useEffect(() => { loadingRef.current     = loading     }, [loading])

  // ── Restore scroll after prepend ──────────────────────────────────────────

  useLayoutEffect(() => {
    const saved = restoreScrollRef.current
    if (saved !== null && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight - saved
      restoreScrollRef.current = null
    }
  }, [messages])

  // ── Helpers ───────────────────────────────────────────────────────────────

  const isNearBottom = () => {
    const el = containerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  // ── Initial load ──────────────────────────────────────────────────────────

  const loadMessages = useCallback(async () => {
    if (!activeFanId) return
    setLoading(true)
    setHasMore(false)
    try {
      const res = await getMessages(activeFanId)
      setMessages(extractMessages(res.data))
      setHasMore(extractHasMore(res.data))
    } catch (err) {
      console.error('[loadMessages]', err)
    } finally {
      setLoading(false)
    }
  }, [activeFanId])

  // ── Load older messages ───────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (!activeFanId || loadingMoreRef.current || !hasMoreRef.current) return
    const oldestId = messagesRef.current[0]?.id
    if (!oldestId) return
    restoreScrollRef.current = containerRef.current?.scrollHeight ?? null
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const res = await getMessages(activeFanId, { before_id: oldestId })
      const older = extractMessages(res.data)
      setHasMore(extractHasMore(res.data))
      setMessages(prev => [...older, ...prev])
    } catch (err) {
      restoreScrollRef.current = null
      console.error('[loadMore]', err)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [activeFanId])

  useEffect(() => { loadMoreFnRef.current = loadMore }, [loadMore])

  // ── Real-time: new message via WebSocket ─────────────────────────────────

  useEffect(() => {
    if (!lastWsMessage || lastWsMessage.fan_id !== activeFanId) return
    setMessages(prev => {
      if (prev.some(m => m.id === lastWsMessage.id)) return prev
      if (isNearBottom()) {
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
      }
      return [...prev, lastWsMessage as unknown as Message]
    })
  }, [lastWsMessage, activeFanId])

  // ── Real-time: message deleted via WebSocket ──────────────────────────────

  useEffect(() => {
    if (!lastDeletedMessageId) return
    if (lastDeletedFanId && lastDeletedFanId !== activeFanId) return
    setMessages(prev => prev.filter(m => m.id !== lastDeletedMessageId))
  }, [lastDeletedMessageId, lastDeletedFanId, activeFanId])

  // ── Poll for new messages every 10 s (fallback when webhook not configured) ──

  useEffect(() => {
    if (!activeFanId) return

    const poll = async () => {
      if (loadingRef.current || loadingMoreRef.current) return
      try {
        const res = await getMessages(activeFanId)
        const fresh = extractMessages(res.data)
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id))
          const added = fresh.filter(m => !ids.has(m.id))
          if (!added.length) return prev
          if (isNearBottom()) {
            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
          }
          return [...prev, ...added]
        })
      } catch {}
    }

    const interval = setInterval(poll, 10_000)
    return () => clearInterval(interval)
  }, [activeFanId])

  // ── Scroll handler ────────────────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el || loadingMoreRef.current || !hasMoreRef.current) return
    if (el.scrollTop < 150) loadMoreFnRef.current()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll, activeFanId])

  // ── Fan switch ────────────────────────────────────────────────────────────

  useEffect(() => {
    setMessages([])
    setInputText('')
    setHasMore(false)
    if (activeFanId) loadMessages()
  }, [activeFanId, loadMessages])

  // ── Scroll to bottom after initial load ───────────────────────────────────

  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!inputText.trim() || !activeFanId || sending) return
    const text = inputText.trim()
    setInputText('')
    setIsTypingToActiveFan(false)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    setSending(true)
    try {
      const res = await sendMessage(activeFanId, text)
      const sent: Message = res.data?.id ? res.data : (res.data?.message ?? res.data)
      setMessages(prev => [...prev, sent])
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
    } catch (_) {
      toast.error('Failed to send message')
      setInputText(text)
    }
    setSending(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setInputText(text)
    const hasText = text.trim().length > 0
    setIsTypingToActiveFan(hasText)

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    if (hasText && activeFanId) {
      typingTimerRef.current = setTimeout(async () => {
        try { await sendTypingIndicator(activeFanId) } catch {}
        // Re-schedule every ~3.5 s while still typing (OF indicator lasts ~4 s)
        if (typingTimerRef.current) {
          typingTimerRef.current = setTimeout(async () => {
            try { await sendTypingIndicator(activeFanId) } catch {}
          }, 3500)
        }
      }, 1000)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!activeFanId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-700 text-sm">
        Select a fan to start messaging
      </div>
    )
  }

  const fanName   = activeFanName || 'Fan'
  const isOnline  = !!activeFanId && fanOnlineIds.includes(activeFanId)
  const isTyping  = !!activeFanId && fanTypingIds.includes(activeFanId)

  return (
    <div className="flex flex-1 min-h-0">
      {/* Chat column */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* ── Chat header ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1e1e1e] bg-[#0d0d0d] shrink-0">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-[#2a2a2a] overflow-hidden flex items-center justify-center text-xs font-bold text-gray-400">
              {activeFanAvatar
                ? <img src={activeFanAvatar} alt="" className="w-full h-full object-cover" />
                : fanName[0]?.toUpperCase()
              }
            </div>
            {isOnline && (
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-500 border-2 border-[#0d0d0d]" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-white truncate">{fanName}</span>
            <span className={`text-[10px] leading-none ${isTyping ? 'text-brand-400' : isOnline ? 'text-green-400' : 'text-gray-600'}`}>
              {isTyping ? 'typing...' : isOnline ? 'online' : 'offline'}
            </span>
          </div>
        </div>

        {/* ── Message area ── */}
        <div ref={containerRef} className="flex-1 overflow-y-auto">
          {loading ? (
            <MessageSkeletons />
          ) : (
            <div className="px-4 py-4 space-y-1">

              {loadingMore && (
                <div className="flex justify-center py-3">
                  <Loader2 size={16} className="animate-spin text-gray-600" />
                </div>
              )}

              {!hasMore && !loadingMore && messages.length > 0 && (
                <div className="flex items-center gap-2 py-4 text-gray-700">
                  <div className="flex-1 h-px bg-[#1e1e1e]" />
                  <span className="text-[10px] tracking-wide uppercase">Beginning of conversation</span>
                  <div className="flex-1 h-px bg-[#1e1e1e]" />
                </div>
              )}

              {messages.length === 0 ? (
                <div className="py-20 text-center text-gray-700 text-sm">No messages</div>
              ) : (
                messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
              )}

              {/* Typing bubble — shown when FAN is typing a message to us */}
              {activeFanId && fanTypingIds.includes(activeFanId) && (
                <TypingBubble name={fanName} avatar={activeFanAvatar} />
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* AI Suggestion Bar */}
        <SuggestionBar fanId={activeFanId} onSelect={(text) => setInputText(text)} />

        {/* Text input */}
        <div className="border-t border-[#1e1e1e] bg-[#0f0f0f] px-3 py-2">
          <textarea
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={2}
            className="w-full bg-transparent text-sm text-white placeholder-gray-600 resize-none outline-none"
          />
        </div>

        {/* Toolbar */}
        <Toolbar
          fanId={activeFanId}
          accountId={activeAccount?.of_user_id || ''}
          onSend={handleSend}
          sending={sending}
          hasText={!!inputText.trim()}
          onEmojiSelect={(emoji) => setInputText((prev) => prev + emoji)}
        />
      </div>

      {/* Fan profile sidebar */}
      {showProfile && (
        <div className="w-72 border-l border-[#1e1e1e] shrink-0 overflow-y-auto">
          <FanProfilePanel fanId={activeFanId} onClose={() => setShowProfile(false)} />
        </div>
      )}

      {!showProfile && (
        <button
          onClick={() => setShowProfile(true)}
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-l-lg px-1 py-3 text-gray-500 hover:text-white text-xs"
        >
          ◀
        </button>
      )}
    </div>
  )
}
