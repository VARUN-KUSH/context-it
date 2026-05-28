import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { getFans, getFanChats, getFan } from '../../services/api'
import { useStore } from '../../store'
import { Search, Loader2 } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'

const PAGE_SIZE = 20

interface Fan {
  id: string
  display_name?: string
  username?: string
  avatar_url?: string
  last_message_at?: string
  last_message?: string | null
  last_message_from_creator?: boolean | null
  total_spent: number
  is_subscribed: boolean
  tags: { id: number; name: string; color: string }[]
}

interface ChatData {
  last_message?: string | null
  last_message_at?: string | null
  is_sent_by_me?: boolean
  is_read?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPage(raw: unknown): { fans: Fan[]; hasMore: boolean } {
  if (Array.isArray(raw)) return { fans: raw as Fan[], hasMore: false }
  const r = raw as Record<string, unknown>
  const fans = Array.isArray(r.fans) ? (r.fans as Fan[]) : []
  const hasMore = Boolean(r.has_more)
  return { fans, hasMore }
}

function formatSpend(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`
  return `$${amount.toFixed(0)}`
}

function formatMsgTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isToday(d))     return format(d, 'h:mm a')
    if (isYesterday(d)) return 'Yesterday'
    return format(d, 'MMM d')
  } catch {
    return ''
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FanList() {
  const { activeAccountId, activeFanId, fanTypingIds, fanOnlineIds, lastWsMessage, setActiveFan } = useStore()

  const [fans, setFans]               = useState<Fan[]>([])
  const [search, setSearch]           = useState('')
  const [loading, setLoading]         = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [chatData, setChatData]       = useState<Record<string, ChatData>>({})

  const loadingMoreRef = useRef(false)
  const hasMoreRef     = useRef(false)
  const offsetRef      = useRef(0)
  const searchRef      = useRef('')
  const loadMoreFnRef  = useRef<() => void>(() => {})
  const sentinelRef    = useRef<HTMLDivElement>(null)
  const fetchingFanIds = useRef<Set<string>>(new Set())
  const fansRef        = useRef<Fan[]>([])

  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])
  useEffect(() => { searchRef.current  = search  }, [search])
  useEffect(() => { fansRef.current    = fans    }, [fans])

  // ── Ensure a fan is in the list (fetch from API if not already loaded) ───

  const ensureFanLoaded = useCallback((fanId: string) => {
    if (!fanId) return
    if (fansRef.current.some(f => f.id === fanId)) return  // already in list
    if (fetchingFanIds.current.has(fanId)) return           // fetch in-flight
    fetchingFanIds.current.add(fanId)
    getFan(fanId)
      .then(res => {
        const fan = res.data as Fan
        if (fan?.id) {
          setFans(p => p.some(f => f.id === fan.id) ? p : [fan, ...p])
        }
      })
      .catch(() => {})
      .finally(() => fetchingFanIds.current.delete(fanId))
  }, [])

  // ── Fresh load ────────────────────────────────────────────────────────────

  const load = useCallback(async (searchValue: string) => {
    if (!activeAccountId) return
    setLoading(true)
    setFans([])
    setHasMore(false)
    setError(null)
    offsetRef.current = 0
    try {
      const res = await getFans(activeAccountId, {
        search: searchValue || undefined,
        offset: 0,
        limit: PAGE_SIZE,
      })
      const { fans: list, hasMore: more } = extractPage(res.data)
      setFans(list)
      setHasMore(more)
      offsetRef.current = list.length
    } catch (err: any) {
      console.error('[FanList load]', err)
      setError(err?.response?.data?.detail || err?.message || 'Failed to load fans')
    } finally {
      setLoading(false)
    }
  }, [activeAccountId])

  // ── Load more ─────────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (!activeAccountId || loadingMoreRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const res = await getFans(activeAccountId, {
        search: searchRef.current || undefined,
        offset: offsetRef.current,
        limit: PAGE_SIZE,
      })
      const { fans: list, hasMore: more } = extractPage(res.data)
      setFans(prev => [...prev, ...list])
      setHasMore(more)
      offsetRef.current += list.length
    } catch (err) {
      console.error('[FanList loadMore]', err)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [activeAccountId])

  useEffect(() => { loadMoreFnRef.current = loadMore }, [loadMore])

  // ── Chat data — fetch once on account switch, then update via WebSocket ──────

  useEffect(() => {
    if (!activeAccountId) return
    getFanChats(activeAccountId)
      .then((res) => {
        const map: Record<string, ChatData> = {}
        const list = Array.isArray(res.data) ? res.data : []
        for (const c of list) {
          if (c.fan_id) map[c.fan_id] = {
            last_message:    c.last_message,
            last_message_at: c.last_message_at,
            is_sent_by_me:   c.is_sent_by_me,
            is_read:         c.is_read,
          }
        }
        setChatData(map)
      })
      .catch(() => {})
  }, [activeAccountId])

  // ── Patch chatData + bubble fan to top when a new WebSocket message arrives ──

  useEffect(() => {
    if (!lastWsMessage) return
    const { fan_id, content, sent_at, is_read, from_creator } = lastWsMessage as any
    if (!fan_id) return

    // Ensure the fan is in the list (fetch if missing)
    ensureFanLoaded(fan_id)

    // Move fan to top of list so new/active chats are immediately visible
    setFans(prev => {
      const idx = prev.findIndex(f => f.id === fan_id)
      if (idx <= 0) return prev
      const fan = prev[idx]
      return [fan, ...prev.slice(0, idx), ...prev.slice(idx + 1)]
    })

    setChatData(prev => ({
      ...prev,
      [fan_id]: {
        last_message:    content ?? null,
        last_message_at: sent_at ?? null,
        is_sent_by_me:   Boolean(from_creator),
        is_read:         Boolean(is_read),
      },
    }))
  }, [lastWsMessage, ensureFanLoaded])

  // ── Ensure typing fans are in the list ────────────────────────────────────

  useEffect(() => {
    for (const fanId of fanTypingIds) {
      ensureFanLoaded(fanId)
    }
  }, [fanTypingIds, ensureFanLoaded])

  // ── Triggers ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setSearch('')
    load('')
  }, [activeAccountId, load])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  // ── IntersectionObserver ──────────────────────────────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreFnRef.current() },
      { threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // ── Sort: typing fans visually first, then the rest ──────────────────────

  const displayedFans = useMemo(() => {
    if (fanTypingIds.length === 0) return fans
    const typing: Fan[] = []
    const rest: Fan[] = []
    for (const f of fans) {
      if (fanTypingIds.includes(f.id)) typing.push(f)
      else rest.push(f)
    }
    return [...typing, ...rest]
  }, [fans, fanTypingIds])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2 bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-1.5">
          <Search size={13} className="text-gray-500 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fans..."
            className="bg-transparent text-sm text-white placeholder-gray-600 flex-1 outline-none"
          />
          {loading && <Loader2 size={12} className="text-gray-500 animate-spin shrink-0" />}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">

        {/* Skeleton */}
        {loading && (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div className="w-11 h-11 rounded-full bg-[#2a2a2a]" />
                  <div className="h-2 w-8 bg-[#2a2a2a] rounded-full" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3 bg-[#2a2a2a] rounded-full w-1/2" />
                    <div className="h-2 bg-[#222] rounded-full w-10" />
                  </div>
                  <div className="h-2.5 bg-[#1e1e1e] rounded-full w-4/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="text-center text-red-400 text-xs mt-12 px-4 leading-relaxed">{error}</div>
        )}

        {/* Empty */}
        {!loading && !error && displayedFans.length === 0 && (
          <div className="text-center text-gray-600 text-sm mt-12">No fans found</div>
        )}

        {/* Fan rows */}
        {!loading && displayedFans.map((fan) => {
          const chat     = chatData[fan.id]
          const isTyping = fanTypingIds.includes(fan.id)
          const isOnline = fanOnlineIds.includes(fan.id)

          // Prefer live chatData overlay, fall back to DB-sourced last_message
          const lastMsg    = chat?.last_message   ?? fan.last_message   ?? null
          const isFromMe   = chat !== undefined   ? Boolean(chat.is_sent_by_me)   : Boolean(fan.last_message_from_creator)
          const isUnread   = chat !== undefined   ? (!chat.is_sent_by_me && !chat.is_read) : false
          const timeStr    = formatMsgTime(chat?.last_message_at ?? fan.last_message_at ?? null)

          const initial = (fan.display_name || fan.username || '?')[0].toUpperCase()

          return (
            <button
              key={fan.id}
              onClick={() => setActiveFan(fan.id, fan.display_name || fan.username || 'Fan', fan.avatar_url)}
              className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-[#161616] transition-colors border-b border-[#111] ${
                activeFanId === fan.id ? 'bg-[#1a1a1a] border-l-2 border-l-brand-500' : ''
              }`}
            >
              {/* Avatar column */}
              <div className="flex flex-col items-center shrink-0 gap-1">
                <div className="relative">
                  <div className="w-11 h-11 rounded-full bg-[#2a2a2a] overflow-hidden flex items-center justify-center text-sm font-bold text-gray-400">
                    {fan.avatar_url
                      ? <img src={fan.avatar_url} alt="" className="w-full h-full object-cover" />
                      : initial
                    }
                  </div>
                  {isOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#0d0d0d]" />
                  )}
                </div>
                <span className="text-[10px] font-bold text-green-400 leading-none">
                  {formatSpend(fan.total_spent)}
                </span>
              </div>

              {/* Content column */}
              <div className="flex-1 min-w-0 text-left">

                {/* Row 1: name + tags + time */}
                <div className="flex items-center gap-1.5 justify-between">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className={`text-[13px] font-semibold truncate ${isUnread ? 'text-white' : 'text-gray-200'}`}>
                      {fan.display_name || fan.username || 'Unknown'}
                    </span>
                    {fan.tags.slice(0, 1).map((t) => (
                      <span
                        key={t.id}
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                        style={{ background: t.color + '22', color: t.color }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                  {timeStr && (
                    <span className={`text-[10px] shrink-0 ${isUnread ? 'text-blue-400' : 'text-gray-600'}`}>
                      {timeStr}
                    </span>
                  )}
                </div>

                {/* Row 2: last message + unread dot */}
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[12px] truncate flex-1 ${
                    isTyping
                      ? 'text-brand-400 italic'
                      : isUnread
                        ? 'text-gray-100 font-medium'
                        : 'text-gray-500'
                  }`}>
                    {isTyping ? (
                      'typing...'
                    ) : lastMsg ? (
                      isFromMe ? `You: ${lastMsg}` : lastMsg
                    ) : (
                      <span className="text-gray-600">No messages yet</span>
                    )}
                  </span>
                  {isUnread && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 ml-1" />
                  )}
                </div>

              </div>
            </button>
          )
        })}

        {/* Loading next page */}
        {loadingMore && (
          <div className="flex justify-center py-4">
            <Loader2 size={15} className="animate-spin text-gray-600" />
          </div>
        )}

        {/* All loaded */}
        {!loading && !loadingMore && !hasMore && displayedFans.length > 0 && (
          <div className="text-center text-gray-700 text-[10px] py-4 tracking-wide uppercase">
            All fans loaded
          </div>
        )}

        <div ref={sentinelRef} className="h-1" />
      </div>
    </div>
  )
}
