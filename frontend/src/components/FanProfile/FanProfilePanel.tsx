import { useEffect, useState } from 'react'
import { getFan, updateFanNotes, summarizeFan, getTags, updateFanTags } from '../../services/api'
import { X, Sparkles, DollarSign, MessageSquare, Tag } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'

interface Fan {
  id: string
  display_name?: string
  username?: string
  avatar_url?: string
  total_spent: number
  tip_count: number
  message_count: number
  subscribed_at?: string
  is_subscribed: boolean
  manual_notes?: string
  ai_summary?: string
  tags: { id: number; name: string; color: string }[]
}

interface TagOption {
  id: number
  name: string
  color: string
}

interface Props {
  fanId: string
  onClose: () => void
}

export default function FanProfilePanel({ fanId, onClose }: Props) {
  const [fan, setFan] = useState<Fan | null>(null)
  const [allTags, setAllTags] = useState<TagOption[]>([])
  const [notes, setNotes] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [fanRes, tagsRes] = await Promise.all([getFan(fanId), getTags()])
        setFan(fanRes.data)
        setNotes(fanRes.data.manual_notes || '')
        setAllTags(tagsRes.data)
      } catch (_) {}
    }
    load()
  }, [fanId])

  const handleSaveNotes = async () => {
    if (!fan) return
    setSavingNotes(true)
    try {
      await updateFanNotes(fanId, notes)
      toast.success('Notes saved')
    } catch (_) {
      toast.error('Failed to save notes')
    }
    setSavingNotes(false)
  }

  const handleSummarize = async () => {
    setSummarizing(true)
    try {
      const res = await summarizeFan(fanId)
      setFan((prev) => prev ? { ...prev, ai_summary: res.data.summary } : prev)
      toast.success('Summary updated')
    } catch (_) {
      toast.error('Failed to generate summary')
    }
    setSummarizing(false)
  }

  const handleToggleTag = async (tagId: number) => {
    if (!fan) return
    const currentIds = fan.tags.map((t) => t.id)
    const newIds = currentIds.includes(tagId)
      ? currentIds.filter((id) => id !== tagId)
      : [...currentIds, tagId]
    try {
      const res = await updateFanTags(fanId, newIds)
      setFan((prev) => prev ? { ...prev, tags: res.data.tags } : prev)
    } catch (_) {
      toast.error('Failed to update tags')
    }
  }

  if (!fan) {
    return (
      <div className="p-4 space-y-3 animate-pulse">
        <div className="h-4 bg-[#1e1e1e] rounded w-3/4" />
        <div className="h-4 bg-[#1e1e1e] rounded w-1/2" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fan Profile</span>
        <button onClick={onClose} className="text-gray-600 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Identity */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#2a2a2a] flex items-center justify-center text-lg font-bold text-gray-400 overflow-hidden shrink-0">
            {fan.avatar_url ? (
              <img src={fan.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              (fan.display_name || fan.username || '?')[0].toUpperCase()
            )}
          </div>
          <div>
            <div className="font-semibold text-white">{fan.display_name || fan.username}</div>
            <div className="text-xs text-gray-500">@{fan.username}</div>
            {fan.subscribed_at && (
              <div className="text-[10px] text-gray-600 mt-0.5">
                Sub since {formatDistanceToNow(new Date(fan.subscribed_at), { addSuffix: true })}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard icon={<DollarSign size={12} />} label="Spent" value={`$${fan.total_spent.toFixed(0)}`} color="text-brand-400" />
          <StatCard icon={<MessageSquare size={12} />} label="Messages" value={String(fan.message_count)} color="text-blue-400" />
          <StatCard icon={<DollarSign size={12} />} label="Tips" value={String(fan.tip_count)} color="text-yellow-400" />
        </div>

        {/* AI Summary */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">AI Summary</span>
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 disabled:opacity-50"
            >
              <Sparkles size={10} />
              {summarizing ? 'Generating...' : 'Refresh'}
            </button>
          </div>
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-3 text-xs text-gray-400 leading-relaxed min-h-[60px]">
            {fan.ai_summary || (
              <span className="text-gray-600 italic">
                Click "Refresh" to generate an AI summary of this fan
              </span>
            )}
          </div>
        </div>

        {/* Tags */}
        <div>
          <div className="flex items-center gap-1 mb-2">
            <Tag size={10} className="text-gray-500" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Tags</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => {
              const active = fan.tags.some((t) => t.id === tag.id)
              return (
                <button
                  key={tag.id}
                  onClick={() => handleToggleTag(tag.id)}
                  className={clsx(
                    'text-[10px] px-2 py-1 rounded-full font-medium border transition-all',
                    active ? 'opacity-100' : 'opacity-30 hover:opacity-60'
                  )}
                  style={{
                    background: active ? tag.color + '22' : 'transparent',
                    color: tag.color,
                    borderColor: tag.color + '44',
                  }}
                >
                  {tag.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            placeholder="Add notes about this fan..."
            rows={4}
            className="w-full bg-[#141414] border border-[#2a2a2a] rounded-xl p-3 text-xs text-gray-300 placeholder-gray-600 resize-none outline-none focus:border-brand-700 transition-colors"
          />
          <button
            onClick={handleSaveNotes}
            disabled={savingNotes}
            className="mt-1.5 text-[10px] text-brand-400 hover:text-brand-300 disabled:opacity-50"
          >
            {savingNotes ? 'Saving...' : 'Save notes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-2.5 text-center">
      <div className={clsx('flex justify-center mb-1', color)}>{icon}</div>
      <div className={clsx('text-sm font-bold', color)}>{value}</div>
      <div className="text-[9px] text-gray-600 mt-0.5">{label}</div>
    </div>
  )
}
