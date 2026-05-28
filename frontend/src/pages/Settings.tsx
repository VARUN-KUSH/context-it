import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, updatePersona, getTags, createTag } from '../services/api'
import { useStore } from '../store'
import { ArrowLeft, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

const TAG_COLORS = ['#ec4899', '#f472b6', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6']
const IS_ELECTRON = typeof window !== 'undefined' && window.location.protocol === 'file:'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { setUser } = useStore()
  const [persona, setPersona] = useState('')
  const [saving, setSaving] = useState(false)
  const [tags, setTags] = useState<{ id: number; name: string; color: string }[]>([])
  const [newTag, setNewTag] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [backendUrl, setBackendUrl] = useState(
    () => localStorage.getItem('backend_url') || import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
  )

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, tagsRes] = await Promise.all([getMe(), getTags()])
        setPersona(meRes.data.persona || '')
        setTags(tagsRes.data)
      } catch (_) {}
    }
    load()
  }, [])

  const handleSavePersona = async () => {
    setSaving(true)
    try {
      const res = await updatePersona(persona)
      setUser(res.data)
      toast.success('Persona saved!')
    } catch (_) {
      toast.error('Failed to save')
    }
    setSaving(false)
  }

  const handleAddTag = async () => {
    if (!newTag.trim()) return
    try {
      const res = await createTag(newTag.trim(), newTagColor)
      setTags((prev) => [...prev, res.data])
      setNewTag('')
      toast.success('Tag created')
    } catch (_) {
      toast.error('Failed to create tag')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Back */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-300 mb-8 transition-colors text-sm"
        >
          <ArrowLeft size={14} />
          Back to CRM
        </button>

        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        {/* Persona */}
        <section className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 mb-6">
          <h2 className="text-base font-semibold mb-1">Creator Persona</h2>
          <p className="text-xs text-gray-500 mb-4">
            Describe your character, tone, and what you like to portray. Claude uses this to write suggestions in your voice.
          </p>
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={6}
            placeholder="e.g. I'm a bubbly, flirty creator who loves teasing fans and making them feel special. I'm playful and a bit mysterious. I love fitness and travel. My messages are warm, personal, and always a little suggestive..."
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 resize-none outline-none focus:border-brand-600 transition-colors"
          />
          <button
            onClick={handleSavePersona}
            disabled={saving}
            className="mt-3 bg-brand-600 hover:bg-brand-500 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save persona'}
          </button>
        </section>

        {/* Tags */}
        <section className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 mb-6">
          <h2 className="text-base font-semibold mb-1">Fan Tags</h2>
          <p className="text-xs text-gray-500 mb-4">
            Create tags to organize and filter fans (e.g. "Whale", "Custom buyer", "Churning").
          </p>

          {/* Existing tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="text-xs px-3 py-1.5 rounded-full font-medium"
                style={{ background: tag.color + '22', color: tag.color, border: `1px solid ${tag.color}44` }}
              >
                {tag.name}
              </span>
            ))}
            {tags.length === 0 && (
              <span className="text-xs text-gray-600 italic">No tags yet</span>
            )}
          </div>

          {/* New tag */}
          <div className="flex items-center gap-2">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              placeholder="Tag name..."
              className="flex-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-brand-600"
            />
            <div className="flex gap-1">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewTagColor(c)}
                  className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline: newTagColor === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleAddTag}
              className="flex items-center gap-1 bg-[#1e1e1e] hover:bg-[#2a2a2a] text-gray-300 px-3 py-2 rounded-lg text-sm transition-colors"
            >
              <Plus size={13} />
              Add
            </button>
          </div>
        </section>

        {/* Backend URL — only relevant in Electron */}
        {IS_ELECTRON && (
          <section className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 mb-6">
            <h2 className="text-base font-semibold mb-1">Backend URL</h2>
            <p className="text-xs text-gray-500 mb-4">
              The URL of the backend server. Use the ngrok URL if the server is on a different machine.
            </p>
            <div className="flex gap-2">
              <input
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="https://xxxx.ngrok-free.app"
                className="flex-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-brand-600 font-mono"
              />
              <button
                onClick={() => {
                  const url = backendUrl.trim().replace(/\/$/, '')
                  localStorage.setItem('backend_url', url)
                  toast.success('Backend URL saved — please restart the app')
                }}
                className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
              >
                Save
              </button>
            </div>
          </section>
        )}

        {/* Logout */}
        <section className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6">
          <h2 className="text-base font-semibold mb-1">Account</h2>
          <button
            onClick={handleLogout}
            className="mt-2 border border-red-900 text-red-400 hover:bg-red-950 px-5 py-2 rounded-lg text-sm transition-colors"
          >
            Log out
          </button>
        </section>
      </div>
    </div>
  )
}
