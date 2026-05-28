import { useStore } from '../../store'
import { ChevronDown, Plus } from 'lucide-react'
import { useState } from 'react'

interface Props {
  onAddAccount: () => void
}

export default function AccountSwitcher({ onAddAccount }: Props) {
  const { accounts, activeAccountId, setActiveAccount } = useStore()
  const [open, setOpen] = useState(false)
  const active = accounts.find((a) => a.id === activeAccountId)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] rounded-xl px-3 py-2 transition-colors w-full"
      >
        <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
          {active?.username?.[0]?.toUpperCase() || '?'}
        </div>
        <span className="text-sm text-white truncate flex-1 text-left">
          {active?.display_name || active?.username || 'Select account'}
        </span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden z-50 shadow-xl">
          {accounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => { setActiveAccount(acc.id); setOpen(false) }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-[#222] transition-colors ${
                acc.id === activeAccountId ? 'text-brand-400' : 'text-white'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold">
                {acc.username?.[0]?.toUpperCase()}
              </div>
              <span className="truncate">{acc.display_name || acc.username}</span>
            </button>
          ))}
          <button
            onClick={() => { onAddAccount(); setOpen(false) }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:bg-[#222] border-t border-[#2a2a2a] transition-colors"
          >
            <Plus size={14} />
            Add account
          </button>
        </div>
      )}
    </div>
  )
}
