import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, getAccounts, addAccount, syncAccount } from '../services/api'
import { useStore } from '../store'
import AccountSwitcher from '../components/AccountSwitcher/AccountSwitcher'
import FanList from '../components/FanList/FanList'
import ChatView from '../components/ChatView/ChatView'
import { Settings, RefreshCw, Users, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function DashboardPage() {
  const { setUser, setAccounts, activeAccountId, setActiveAccount } = useStore()
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const init = async () => {
      try {
        const [meRes, accRes] = await Promise.all([getMe(), getAccounts()])
        setUser(meRes.data)
        setAccounts(accRes.data)
        if (accRes.data.length > 0 && !activeAccountId) {
          setActiveAccount(accRes.data[0].id)
        }
      } catch (_) {
        navigate('/login')
      }
    }
    init()
  }, [])

  const handleAddAccount = async () => {
    setAdding(true)
    try {
      await addAccount({})
      const accRes = await getAccounts()
      setAccounts(accRes.data)
      if (accRes.data.length > 0) setActiveAccount(accRes.data[0].id)
      toast.success('Account linked! Syncing fans in background...')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to link account')
    }
    setAdding(false)
  }

  const handleSync = async () => {
    if (!activeAccountId) return
    setSyncing(true)
    try {
      await syncAccount(activeAccountId)
      toast.success('Sync started — fans will update shortly')
    } catch (_) {
      toast.error('Sync failed')
    }
    setSyncing(false)
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 flex flex-col border-r border-[#1a1a1a] bg-[#0d0d0d] shrink-0">
        {/* Top bar */}
        <div className="p-3 border-b border-[#1a1a1a] space-y-2">
          <AccountSwitcher onAddAccount={handleAddAccount} />
          <div className="flex gap-1.5 items-center">
            <button
              onClick={handleSync}
              disabled={syncing || !activeAccountId}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 disabled:opacity-40 transition-colors"
              title="Sync fans"
            >
              <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
              Sync
            </button>
            <div className="flex-1" />
            <button
              onClick={() => navigate('/settings')}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="Settings"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {/* Fan list */}
        <div className="flex-1 min-h-0">
          {activeAccountId ? (
            <FanList />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-700">
              <Users size={24} />
              <p className="text-sm text-center px-4">
                Link your OnlyFans account to get started
              </p>
              <button
                onClick={handleAddAccount}
                disabled={adding}
                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50"
              >
                {adding ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Linking...
                  </>
                ) : (
                  '+ Link account'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-w-0 relative">
        <ChatView />
      </div>
    </div>
  )
}
