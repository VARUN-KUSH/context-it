import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { login, register } from '../services/api'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isRegister) {
        await register(email, username, password)
        toast.success('Account created! Please log in.')
        setIsRegister(false)
      } else {
        const res = await login(username, password)
        localStorage.setItem('token', res.data.access_token)
        navigate('/')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen overflow-y-auto bg-[#0f0f0f] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" className="w-12 h-12 rounded-xl" aria-hidden="true">
              <defs>
                <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F5A8C5"/>
                  <stop offset="55%" stopColor="#D294DC"/>
                  <stop offset="100%" stopColor="#B568E5"/>
                </linearGradient>
              </defs>
              <rect width="320" height="320" rx="72" fill="url(#lg)"/>
              <circle cx="82" cy="98" r="38" fill="#1A1A1A"/>
              <circle cx="238" cy="98" r="38" fill="#1A1A1A"/>
              <circle cx="82" cy="103" r="16" fill="#F5B8CC"/>
              <circle cx="238" cy="103" r="16" fill="#F5B8CC"/>
              <circle cx="160" cy="172" r="108" fill="#FAFAFA"/>
              <ellipse cx="123" cy="158" rx="24" ry="32" fill="#1A1A1A" transform="rotate(20 123 158)"/>
              <ellipse cx="197" cy="158" rx="24" ry="32" fill="#1A1A1A" transform="rotate(-20 197 158)"/>
              <circle cx="128" cy="157" r="8.5" fill="#FAFAFA"/>
              <circle cx="192" cy="157" r="8.5" fill="#FAFAFA"/>
              <circle cx="129" cy="158" r="5" fill="#1A1A1A"/>
              <circle cx="191" cy="158" r="5" fill="#1A1A1A"/>
              <circle cx="130.5" cy="156" r="1.8" fill="#FAFAFA"/>
              <circle cx="192.5" cy="156" r="1.8" fill="#FAFAFA"/>
              <ellipse cx="160" cy="202" rx="11" ry="7.5" fill="#1A1A1A"/>
              <path d="M160 210 Q160 221 150 222" stroke="#1A1A1A" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
              <path d="M160 210 Q160 221 170 222" stroke="#1A1A1A" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
            </svg>
            <h1 className="text-3xl font-bold text-white">context-it</h1>
          </div>
          <p className="text-gray-500 text-sm">Creator relationship management</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 space-y-4"
        >
          <h2 className="text-xl font-semibold text-white mb-2">
            {isRegister ? 'Create account' : 'Welcome back'}
          </h2>

          {isRegister && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
                placeholder="you@example.com"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
              placeholder="username"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : isRegister ? 'Create account' : 'Sign in'}
          </button>

          <p className="text-center text-sm text-gray-500">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-brand-400 hover:text-brand-300"
            >
              {isRegister ? 'Sign in' : 'Register'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
