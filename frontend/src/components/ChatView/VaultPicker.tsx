import { useState, useEffect } from 'react'
import { X, Search, Loader2, Image, Video, Mic } from 'lucide-react'
import { getVaultMedia } from '../../services/api'

interface VaultFile {
  url?: string
  width?: number
  height?: number
}

export interface VaultItem {
  id: number
  type?: string
  createdAt?: string
  created_at?: string
  files?: {
    full?: VaultFile
    thumb?: VaultFile
    preview?: VaultFile
    squarePreview?: VaultFile
    [key: string]: VaultFile | undefined
  }
  // legacy flat fields
  src?: string
  thumb?: string
  thumbnail?: string
  preview?: string
  url?: string
  [key: string]: unknown
}

interface Props {
  accountId: number
  onAdd: (items: VaultItem[]) => void
  onClose: () => void
}

type Filter = 'all' | 'photo' | 'gif' | 'video' | 'audio'

function getThumb(item: VaultItem): string {
  return (
    item.files?.thumb?.url ||
    item.files?.squarePreview?.url ||
    item.files?.preview?.url ||
    item.files?.full?.url ||
    item.thumb ||
    item.thumbnail ||
    item.preview ||
    item.src ||
    item.url ||
    ''
  )
}

function getDate(item: VaultItem): string {
  const raw = (item.createdAt || item.created_at || '') as string
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  } catch {
    return ''
  }
}

function MediaTypeIcon({ type }: { type?: string }) {
  if (type === 'video') return <Video size={20} className="text-gray-500" />
  if (type === 'audio') return <Mic size={20} className="text-gray-500" />
  return <Image size={20} className="text-gray-500" />
}

export default function VaultPicker({ accountId, onAdd, onClose }: Props) {
  const [items, setItems] = useState<VaultItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await getVaultMedia(accountId, 0, 100)
        const data = res.data
        let list: VaultItem[] = []
        if (Array.isArray(data)) list = data
        else if (Array.isArray(data?.data?.list)) list = data.data.list
        else if (Array.isArray(data?.data)) list = data.data
        else if (Array.isArray(data?.list)) list = data.list
        else if (Array.isArray(data?.items)) list = data.items
        setItems(list)
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to load vault'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [accountId])

  const filtered = items
    .filter(i => filter === 'all' || i.type === filter)
    .filter(i => {
      if (!search) return true
      const s = search.toLowerCase()
      return String(i.id).includes(s) || (i.type || '').toLowerCase().includes(s)
    })

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAdd() {
    const selectedItems = items.filter(i => selected.has(i.id))
    onAdd(selectedItems)
    onClose()
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'photo', label: 'Photo' },
    { key: 'gif', label: 'GIF' },
    { key: 'video', label: 'Video' },
    { key: 'audio', label: 'Audio' },
  ]

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#222] shrink-0">
        <span className="text-xs font-bold tracking-widest text-white uppercase">Vault</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSearch(v => !v)}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <Search size={16} />
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-[#222] shrink-0">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search media..."
            className="w-full bg-[#1a1a1a] text-sm text-white placeholder-gray-600 rounded-lg px-3 py-1.5 outline-none"
          />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 py-2.5 border-b border-[#222] shrink-0 overflow-x-auto">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.key
                ? 'bg-white text-black'
                : 'bg-[#1a1a1a] text-gray-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Section label */}
      <div className="px-4 py-2 text-[10px] font-bold tracking-widest text-gray-600 uppercase shrink-0">
        All Media
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 size={24} className="animate-spin text-gray-500" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-gray-600 text-sm">{error}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex justify-center items-center h-40 text-gray-600 text-sm">
            No media found
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {filtered.map(item => {
              const thumb = getThumb(item)
              const isSelected = selected.has(item.id)
              const dateStr = getDate(item)
              return (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className="relative aspect-square cursor-pointer overflow-hidden rounded bg-[#1a1a1a] select-none"
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <MediaTypeIcon type={item.type} />
                    </div>
                  )}

                  {dateStr && (
                    <span className="absolute top-1 left-1 text-[9px] text-white bg-black/60 px-1 py-0.5 rounded leading-none">
                      {dateStr}
                    </span>
                  )}

                  {/* Selection circle */}
                  <div
                    className={`absolute top-1 right-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-white/70 bg-black/30'
                    }`}
                  >
                    {isSelected && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>

                  {/* Selection overlay */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-blue-500/10 pointer-events-none" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer when items selected */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#222] bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 transition-colors"
            >
              <X size={10} className="text-white" />
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
