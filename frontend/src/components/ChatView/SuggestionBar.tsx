import { useEffect, useRef, useState } from 'react'
import { getSuggestions } from '../../services/api'
import { useStore } from '../../store'
import { Sparkles, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

interface Suggestion {
  id: number
  suggestion_type: 'flirty' | 'connect' | 'upsell' | 'reengage'
  content: string
}

interface SuggestionsData {
  flirty?: Suggestion
  connect?: Suggestion
  upsell?: Suggestion
  reengage?: Suggestion
}

interface Props {
  fanId: string
  onSelect: (text: string) => void
}

const TYPES = [
  { key: 'flirty'   as const, label: '💋 Flirty',     accent: '#f472b6' },
  { key: 'connect'  as const, label: '💙 Connect',     accent: '#60a5fa' },
  { key: 'upsell'   as const, label: '💰 Upsell',      accent: '#facc15' },
  { key: 'reengage' as const, label: '🔥 Re-engage',   accent: '#fb923c' },
]

function stripHtml(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
}

export default function SuggestionBar({ fanId, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState<SuggestionsData>({})
  const [loading, setLoading]         = useState(false)
  const [generating, setGenerating]   = useState(false)
  const [collapsed, setCollapsed]     = useState(false)

  const { suggestionsReadyFanId, lastWsMessage } = useStore()
  const prevFanId = useRef<string | null>(null)

  const load = async (force = false) => {
    if (!fanId) return
    setLoading(true)
    try {
      const res = await getSuggestions(fanId, force)
      setSuggestions(res.data)
      setGenerating(false)
    } catch (_) {}
    setLoading(false)
  }

  // Initial load when fan changes
  useEffect(() => {
    prevFanId.current = fanId
    setSuggestions({})
    setGenerating(false)
    load(false)
  }, [fanId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show "generating" skeleton when the fan sends a new message
  useEffect(() => {
    if (!lastWsMessage) return
    if (lastWsMessage.fan_id !== fanId) return
    if (lastWsMessage.from_creator) return
    // Fan sent a message — suggestions are being regenerated on the backend
    setGenerating(true)
  }, [lastWsMessage, fanId])

  // Auto-refresh when backend signals suggestions are ready for this fan
  useEffect(() => {
    if (suggestionsReadyFanId === fanId) {
      load(false)
    }
  }, [suggestionsReadyFanId]) // eslint-disable-line react-hooks/exhaustive-deps

  const showSkeleton = loading || generating

  return (
    <div className="border-b border-[#1e1e1e] bg-[#0f0f0f]">
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Sparkles size={12} className={clsx('text-brand-400', generating && 'animate-pulse')} />
          <span>AI Suggestions</span>
          {generating && (
            <span className="text-[10px] text-brand-400 animate-pulse">generating…</span>
          )}
          <span className="text-[10px] text-gray-600">{collapsed ? '▲' : '▼'}</span>
        </button>
        <button
          onClick={() => load(true)}
          disabled={loading || generating}
          className="text-gray-600 hover:text-gray-300 transition-colors"
          title="Regenerate suggestions"
        >
          <RefreshCw size={12} className={clsx((loading || generating) && 'animate-spin')} />
        </button>
      </div>

      {/* Cards */}
      {!collapsed && (
        <div className="flex gap-1.5 px-3 pb-3">
          {TYPES.map(({ key, label, accent }) => {
            const sug = suggestions[key]
            return (
              <button
                key={key}
                onClick={() => sug && !showSkeleton && onSelect(stripHtml(sug.content))}
                disabled={!sug || showSkeleton}
                className={clsx(
                  'flex-1 min-w-0 text-left rounded-xl border bg-[#141414] p-2 transition-all',
                  sug && !showSkeleton
                    ? 'border-[#2a2a2a] opacity-100 hover:border-[#3a3a3a]'
                    : 'border-[#1a1a1a] opacity-50 cursor-default'
                )}
              >
                <div className="text-[9px] font-semibold mb-1" style={{ color: accent }}>
                  {label}
                </div>
                {showSkeleton ? (
                  <div className="space-y-1">
                    <div className="h-2 bg-[#222] rounded animate-pulse w-full" />
                    <div className="h-2 bg-[#222] rounded animate-pulse w-3/4" />
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-300 leading-relaxed line-clamp-2">
                    {sug ? stripHtml(sug.content) : 'No suggestion'}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
