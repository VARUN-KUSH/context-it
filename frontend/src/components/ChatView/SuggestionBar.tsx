import { useEffect, useState } from 'react'
import { getSuggestions } from '../../services/api'
import { Sparkles, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

interface Suggestion {
  id: number
  suggestion_type: 'flirty' | 'upsell' | 'reengage'
  content: string
}

interface SuggestionsData {
  flirty?: Suggestion
  upsell?: Suggestion
  reengage?: Suggestion
}

interface Props {
  fanId: string
  onSelect: (text: string) => void
}

const TYPES = [
  { key: 'flirty' as const, label: '💋 Flirty', accent: '#f472b6' },
  { key: 'upsell' as const, label: '💰 Upsell', accent: '#facc15' },
  { key: 'reengage' as const, label: '🔥 Re-engage', accent: '#fb923c' },
]

function stripHtml(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
}

export default function SuggestionBar({ fanId, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState<SuggestionsData>({})
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const load = async (force = false) => {
    if (!fanId) return
    setLoading(true)
    try {
      const res = await getSuggestions(fanId, force)
      setSuggestions(res.data)
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => {
    setSuggestions({})
    load(false)
  }, [fanId])

  return (
    <div className="border-b border-[#1e1e1e] bg-[#0f0f0f]">
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Sparkles size={12} className="text-brand-400" />
          <span>AI Suggestions</span>
          <span className="text-[10px] text-gray-600">{collapsed ? '▲' : '▼'}</span>
        </button>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="text-gray-600 hover:text-gray-300 transition-colors"
          title="Regenerate suggestions"
        >
          <RefreshCw size={12} className={clsx(loading && 'animate-spin')} />
        </button>
      </div>

      {/* Cards */}
      {!collapsed && (
        <div className="flex gap-2 px-3 pb-3">
          {TYPES.map(({ key, label, accent }) => {
            const sug = suggestions[key]
            return (
              <button
                key={key}
                onClick={() => sug && onSelect(stripHtml(sug.content))}
                disabled={!sug || loading}
                className={clsx(
                  'suggestion-card flex-1 min-w-0 text-left rounded-xl border bg-[#141414] p-2.5',
                  sug ? 'border-[#2a2a2a] opacity-100' : 'border-[#1a1a1a] opacity-40 cursor-default'
                )}
              >
                <div className="text-[10px] font-semibold mb-1.5" style={{ color: accent }}>
                  {label}
                </div>
                {loading && !sug ? (
                  <div className="space-y-1">
                    <div className="h-2 bg-[#222] rounded animate-pulse w-full" />
                    <div className="h-2 bg-[#222] rounded animate-pulse w-3/4" />
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-300 leading-relaxed line-clamp-3">
                    {sug ? stripHtml(sug.content) : 'Generating...'}
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
