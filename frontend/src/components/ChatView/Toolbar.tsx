import { useState, useRef, useEffect } from 'react'
import {
  Image, Gift, Video, Mic, LayoutGrid, Calendar,
  DollarSign, AtSign, Type, Lock, Send, Smile
} from 'lucide-react'
import clsx from 'clsx'
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react'

interface Props {
  fanId: string
  accountId: string
  onSend: () => void
  sending: boolean
  hasText: boolean
  onEmojiSelect: (emoji: string) => void
}

export default function Toolbar({ fanId: _fanId, accountId: _accountId, onSend, sending, hasText, onEmojiSelect }: Props) {
  const [showEmojis, setShowEmojis] = useState(false)
  const [showPriceTag, setShowPriceTag] = useState(false)
  const [showVault, setShowVault] = useState(false)
  const [price, setPrice] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close picker when clicking outside
  useEffect(() => {
    if (!showEmojis) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEmojis(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showEmojis])

  function handleEmojiClick(data: EmojiClickData) {
    onEmojiSelect(data.emoji)
  }

  return (
    <div className="border-t border-[#1e1e1e] bg-[#0a0a0a] relative">
      {/* Full emoji picker — floats above toolbar */}
      {showEmojis && (
        <div
          ref={pickerRef}
          className="absolute bottom-full left-0 z-50 mb-1 shadow-2xl"
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={Theme.DARK}
            lazyLoadEmojis
            searchPlaceholder="Search emoji…"
          />
        </div>
      )}

      {/* Price tag input */}
      {showPriceTag && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e1e1e]">
          <DollarSign size={14} className="text-yellow-400" />
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Set PPV price..."
            className="bg-transparent text-sm text-white placeholder-gray-600 outline-none flex-1"
          />
          <button
            onClick={() => setShowPriceTag(false)}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Done
          </button>
        </div>
      )}

      {/* Vault modal (simplified) */}
      {showVault && (
        <div className="px-3 py-2 border-b border-[#1e1e1e] text-xs text-gray-500">
          🔒 Vault — attach media coming soon
          <button onClick={() => setShowVault(false)} className="ml-2 text-brand-400">
            Close
          </button>
        </div>
      )}

      {/* Main toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-2">
        <ToolBtn
          icon={<Smile size={18} />}
          title="Emoji"
          active={showEmojis}
          onClick={() => setShowEmojis((v) => !v)}
          accentColor="text-yellow-300"
        />
        <ToolBtn icon={<Image size={18} />} title="Photo" />
        <ToolBtn icon={<Gift size={18} />} title="GIF" />
        <ToolBtn icon={<Video size={18} />} title="Video" />
        <ToolBtn icon={<Mic size={18} />} title="Audio" />
        <ToolBtn icon={<LayoutGrid size={18} />} title="Media" />
        <ToolBtn icon={<Calendar size={18} />} title="Schedule" />
        <ToolBtn
          icon={<DollarSign size={18} />}
          title="Price tag"
          active={showPriceTag}
          onClick={() => setShowPriceTag(!showPriceTag)}
          accentColor="text-yellow-400"
        />
        <ToolBtn icon={<AtSign size={18} />} title="Mention" />
        <ToolBtn icon={<Type size={18} />} title="Font" />
        <ToolBtn
          icon={<Lock size={18} />}
          title="Vault"
          active={showVault}
          onClick={() => setShowVault(!showVault)}
          accentColor="text-blue-400"
        />

        <div className="flex-1" />

        {/* SEND */}
        <button
          onClick={onSend}
          disabled={!hasText || sending}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all',
            hasText && !sending
              ? 'bg-brand-600 hover:bg-brand-500 text-white'
              : 'bg-[#1a1a1a] text-gray-600 cursor-default'
          )}
        >
          {sending ? (
            <span className="animate-pulse">Sending...</span>
          ) : (
            <>
              <Send size={12} />
              SEND
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function ToolBtn({
  icon,
  title,
  onClick,
  active,
  accentColor,
}: {
  icon: React.ReactNode
  title: string
  onClick?: () => void
  active?: boolean
  accentColor?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'p-2 rounded-lg transition-colors',
        active ? 'bg-[#222]' : 'hover:bg-[#1a1a1a]',
        active && accentColor ? accentColor : 'text-gray-500 hover:text-gray-300'
      )}
    >
      {icon}
    </button>
  )
}
