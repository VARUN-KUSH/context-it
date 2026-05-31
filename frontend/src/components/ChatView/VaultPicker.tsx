import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Search, Loader2, Video, Mic, Image as ImgIcon } from 'lucide-react'
import { getVaultMedia, getVaultLists, getVaultList } from '../../services/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VaultFile { url?: string; width?: number; height?: number }

export interface VaultItem {
  id?: number
  type?: string
  createdAt?: string
  created_at?: string
  files?: {
    full?: VaultFile
    thumb?: VaultFile
    preview?: VaultFile
    squarePreview?: VaultFile
    [k: string]: VaultFile | undefined
  }
  url?: string
  src?: string
  thumb?: string
  [k: string]: unknown
}

interface VaultList {
  id: number
  type: string
  name: string
  hasMedia: boolean
  photosCount?: number
  videosCount?: number
  gifsCount?: number
  audiosCount?: number
  medias?: { type: string; url: string }[]
}

interface Props {
  accountId: number
  onAdd: (items: VaultItem[]) => void
  onClose: () => void
}

type Filter = 'all' | 'photo' | 'gif' | 'video' | 'audio'

// ── URL helpers ───────────────────────────────────────────────────────────────

// cdn.fansapi.com URLs work directly from the browser (signed AWS URLs).
// cdn2.onlyfans.com URLs are IP-restricted (403 from browser).
// We proxy the restricted ones through our backend.
function resolveUrl(rawUrl: string, accountId: number): string {
  if (!rawUrl) return ''
  if (rawUrl.includes('cdn.fansapi.com')) return rawUrl
  if (rawUrl.includes('onlyfans.com')) {
    return `/api/vault/media-proxy?account_id=${accountId}&url=${encodeURIComponent(rawUrl)}`
  }
  return rawUrl
}

// For vault media items, prefer preview/full (always cdn.fansapi.com).
// thumb/squarePreview are cdn2.onlyfans.com (403 from browser).
function getThumb(item: VaultItem, accountId: number): string {
  const raw =
    item.files?.preview?.url ||       // cdn.fansapi.com ✓
    item.files?.full?.url ||           // cdn.fansapi.com ✓
    item.url ||                         // category media thumbnail (may need proxy)
    item.files?.thumb?.url ||          // cdn2.onlyfans.com → proxy
    item.files?.squarePreview?.url ||  // cdn2.onlyfans.com → proxy
    item.src ||
    item.thumb ||
    ''
  return resolveUrl(raw, accountId)
}

function getDate(item: VaultItem): string {
  const raw = (item.createdAt || item.created_at || '') as string
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  } catch { return '' }
}

function parsePage(data: unknown): VaultItem[] {
  if (Array.isArray(data)) return data as VaultItem[]
  const d = data as Record<string, unknown>
  const inner = d?.data as Record<string, unknown> | undefined
  if (Array.isArray(inner?.list)) return inner!.list as VaultItem[]
  if (Array.isArray(d?.data)) return d.data as VaultItem[]
  if (Array.isArray(d?.list)) return d.list as VaultItem[]
  return []
}

function parseCategoryPage(data: unknown): VaultItem[] {
  const d = data as Record<string, unknown>
  const inner = d?.data as Record<string, unknown> | undefined
  let listItem: Record<string, unknown> | null = null
  if (Array.isArray(inner?.list)) listItem = (inner!.list as Record<string, unknown>[])[0]
  else if (inner && typeof inner === 'object') listItem = inner
  if (!listItem) return []
  const medias = listItem.medias
  if (!Array.isArray(medias)) return []
  return medias as VaultItem[]
}

function fmtCount(n?: number): string {
  if (!n) return ''
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

function buildSubtext(cat: VaultList): string {
  const parts: string[] = []
  if (cat.photosCount) parts.push(fmtCount(cat.photosCount))
  if (cat.videosCount) parts.push(fmtCount(cat.videosCount))
  if (cat.gifsCount)   parts.push(fmtCount(cat.gifsCount))
  if (cat.audiosCount) parts.push(fmtCount(cat.audiosCount))
  return parts.join(' · ')
}

// ── MediaThumb ────────────────────────────────────────────────────────────────
// Shows a placeholder icon while loading, fades in the image when ready,
// and falls back to the icon on error.

function MediaThumb({ item, accountId }: { item: VaultItem; accountId: number }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const thumb = getThumb(item, accountId)

  return (
    <div className="w-full h-full relative bg-[#1a1a1a]">
      {/* Placeholder shown while loading or on error */}
      {status !== 'loaded' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <MediaIcon type={item.type} />
        </div>
      )}
      {/* Actual image — hidden until loaded */}
      {thumb && (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}
    </div>
  )
}

function MediaIcon({ type }: { type?: string }) {
  const cls = 'text-gray-700'
  if (type === 'video') return <Video size={20} className={cls} />
  if (type === 'audio') return <Mic  size={20} className={cls} />
  return <ImgIcon size={20} className={cls} />
}

// ── CategoryRow ───────────────────────────────────────────────────────────────

function CategoryRow({
  label, active, thumbs, subtext, onClick, accountId,
}: {
  label: string
  active: boolean
  thumbs: string[]
  subtext?: string
  onClick: () => void
  accountId: number
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-[#1e1e1e]' : 'hover:bg-[#161616]'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold truncate ${active ? 'text-white' : 'text-gray-300'}`}>
          {label}
        </div>
        {subtext && (
          <div className="text-[10px] text-gray-600 mt-0.5">{subtext}</div>
        )}
      </div>
      {thumbs.length > 0 && (
        <div className="flex gap-0.5 shrink-0">
          {thumbs.slice(0, 3).map((url, i) => {
            const resolved = resolveUrl(url, accountId)
            return (
              <div key={i} className="w-7 h-7 rounded overflow-hidden bg-[#2a2a2a]">
                <img
                  src={resolved}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )
          })}
        </div>
      )}
    </button>
  )
}

// ── VaultPicker ───────────────────────────────────────────────────────────────

export default function VaultPicker({ accountId, onAdd, onClose }: Props) {
  const [categories, setCategories] = useState<VaultList[]>([])
  const [catsLoading, setCatsLoading] = useState(true)
  const [activeList, setActiveList] = useState<VaultList | null>(null)

  // FIX: start true so the spinner shows immediately on open (no "no media" flash)
  const [items, setItems]               = useState<VaultItem[]>([])
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore]   = useState(false)
  const [hasMore, setHasMore]           = useState(true)

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filter, setFilter]     = useState<Filter>('all')

  const offsetRef     = useRef(0)
  const loadingRef    = useRef(false)
  const loadKeyRef    = useRef(0)
  const sentinelRef   = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // ── Load categories ────────────────────────────────────────────────────────

  useEffect(() => {
    getVaultLists(accountId)
      .then(res => {
        const d = res.data
        let list: VaultList[] = []
        if (Array.isArray(d?.data?.list)) list = d.data.list
        else if (Array.isArray(d?.data))  list = d.data
        else if (Array.isArray(d?.list))  list = d.list
        setCategories(list.filter(c => c.hasMedia))
      })
      .catch(e => console.error('[VaultPicker] categories', e))
      .finally(() => setCatsLoading(false))
  }, [accountId])

  // ── Fetch a page of media ──────────────────────────────────────────────────

  const fetchPage = useCallback(async (
    list: VaultList | null,
    offset: number,
    key: number,
    isFirst: boolean,
  ) => {
    if (loadingRef.current) return
    loadingRef.current = true
    if (isFirst) setLoadingInitial(true)
    else setLoadingMore(true)

    try {
      let raw: unknown
      if (!list) {
        const res = await getVaultMedia(accountId, offset, 100)
        raw = res.data
      } else {
        const res = await getVaultList(accountId, list.id, offset, 100)
        raw = res.data
      }

      if (loadKeyRef.current !== key) return

      const page = list ? parseCategoryPage(raw) : parsePage(raw)
      const more = page.length === 100

      if (isFirst) setItems(page)
      else setItems(prev => [...prev, ...page])

      offsetRef.current = offset + page.length
      setHasMore(more)
    } catch (e) {
      console.error('[VaultPicker] fetchPage', e)
    } finally {
      loadingRef.current = false
      setLoadingInitial(false)
      setLoadingMore(false)
    }
  }, [accountId])

  // ── Re-load when active list changes ──────────────────────────────────────

  useEffect(() => {
    const key = ++loadKeyRef.current
    loadingRef.current = false  // reset guard so every category switch can fetch
    offsetRef.current  = 0
    setItems([])
    setHasMore(true)
    setSelected(new Set())
    setFilter('all')
    setLoadingInitial(true)     // show spinner immediately
    fetchPage(activeList, 0, key, true)
  }, [activeList?.id ?? 'all']) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load more ─────────────────────────────────────────────────────────────

  const loadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return
    fetchPage(activeList, offsetRef.current, loadKeyRef.current, false)
  }, [hasMore, activeList, fetchPage])

  // ── Infinite scroll — scroll container is the root ────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current
    const root     = scrollAreaRef.current
    if (!sentinel || !root) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { root, rootMargin: '200px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  // ── Selection ─────────────────────────────────────────────────────────────

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleAdd() {
    const out = items.filter(i => i.id != null && selected.has(i.id as number))
    onAdd(out)
    onClose()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = filter === 'all'
    ? items
    : items.filter(i => (i.type || '').toLowerCase() === filter)

  const allMediaCounts = useMemo(() => {
    if (activeList !== null) return null
    const c = { photo: 0, video: 0, gif: 0, audio: 0 }
    items.forEach(i => {
      const t = (i.type || '').toLowerCase()
      if      (t === 'photo') c.photo++
      else if (t === 'video') c.video++
      else if (t === 'gif')   c.gif++
      else if (t === 'audio') c.audio++
    })
    return c
  }, [items, activeList])

  function buildAllMediaSubtext(): string | undefined {
    if (loadingInitial && items.length === 0) return 'Loading…'
    if (!allMediaCounts) return undefined
    const parts: string[] = []
    if (allMediaCounts.photo) parts.push(`${fmtCount(allMediaCounts.photo)} photos`)
    if (allMediaCounts.video) parts.push(`${fmtCount(allMediaCounts.video)} videos`)
    if (allMediaCounts.gif)   parts.push(`${fmtCount(allMediaCounts.gif)} GIFs`)
    if (allMediaCounts.audio) parts.push(`${fmtCount(allMediaCounts.audio)} audio`)
    if (!parts.length) return undefined
    return parts.join(' · ') + (hasMore ? '+' : '')
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',   label: 'All'   },
    { key: 'photo', label: 'Photo' },
    { key: 'gif',   label: 'GIF'   },
    { key: 'video', label: 'Video' },
    { key: 'audio', label: 'Audio' },
  ]

  const rightTitle = activeList ? activeList.name.toUpperCase() : 'ALL MEDIA'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#0d0d0d]">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#222] shrink-0">
        <span className="text-xs font-bold tracking-widest text-white uppercase">Vault</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* ── Two-panel body ── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT — categories */}
        <div className="w-[42%] border-r border-[#222] flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-[9px] font-bold tracking-widest text-gray-600 uppercase shrink-0">
            Default
          </div>
          <div className="flex-1 overflow-y-auto">
            <CategoryRow
              label="All media"
              active={activeList === null}
              thumbs={[]}
              subtext={buildAllMediaSubtext()}
              onClick={() => setActiveList(null)}
              accountId={accountId}
            />
            {catsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 size={16} className="animate-spin text-gray-600" />
              </div>
            ) : (
              categories.map(cat => (
                <CategoryRow
                  key={cat.id}
                  label={cat.name}
                  active={activeList?.id === cat.id}
                  thumbs={cat.medias?.slice(0, 3).map(m => m.url) ?? []}
                  subtext={buildSubtext(cat)}
                  onClick={() => setActiveList(cat)}
                  accountId={accountId}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — media grid */}
        <div className="flex-1 flex flex-col min-w-0">

          <div className="flex items-center justify-between px-3 py-2 shrink-0">
            <span className="text-[10px] font-bold tracking-widest text-white uppercase">{rightTitle}</span>
            <Search size={14} className="text-gray-600" />
          </div>

          <div className="px-3 pb-1 text-[9px] font-bold tracking-widest text-gray-600 uppercase shrink-0">
            Recent
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto shrink-0">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === f.key ? 'bg-white text-black' : 'bg-[#1a1a1a] text-gray-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Scrollable grid — used as IntersectionObserver root */}
          <div ref={scrollAreaRef} className="flex-1 overflow-y-auto px-1 pb-2">
            {loadingInitial ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 size={24} className="animate-spin text-gray-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex justify-center items-center h-40 text-gray-600 text-sm">
                No media found
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-0.5">
                  {filtered.map((item, idx) => {
                    const itemId     = item.id as number | undefined
                    const isSelected = itemId != null && selected.has(itemId)
                    const selectable = itemId != null
                    const dateStr    = getDate(item)

                    return (
                      <div
                        key={itemId ?? `${idx}-${item.createdAt}`}
                        onClick={() => selectable && toggle(itemId!)}
                        className={`relative aspect-square overflow-hidden rounded select-none ${
                          selectable ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <MediaThumb item={item} accountId={accountId} />

                        {dateStr && (
                          <span className="absolute top-0.5 left-0.5 text-[8px] text-white bg-black/60 px-1 py-0.5 rounded leading-none pointer-events-none">
                            {dateStr}
                          </span>
                        )}

                        {selectable && (
                          <>
                            <div className={`absolute top-0.5 right-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected ? 'bg-blue-500 border-blue-500' : 'border-white/70 bg-black/30'
                            }`}>
                              {isSelected && (
                                <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-blue-500/15 pointer-events-none" />
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Sentinel — triggers loadMore when scrolled into view */}
                <div ref={sentinelRef} className="flex justify-center py-4 min-h-[1px]">
                  {loadingMore && <Loader2 size={18} className="animate-spin text-gray-600" />}
                  {!loadingMore && !hasMore && items.length > 0 && (
                    <span className="text-[10px] text-gray-700">All {items.length} items loaded</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Selection footer ── */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#222] bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600"
            >
              <X size={9} className="text-white" />
            </button>
            <span className="text-sm text-white font-medium">
              {selected.size} / {filtered.length} Selected
            </span>
          </div>
          <button
            onClick={handleAdd}
            className="px-6 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-full transition-colors"
          >
            ADD
          </button>
        </div>
      )}
    </div>
  )
}
