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
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img src="/logo.svg" alt="context-it logo" className="w-12 h-12" />
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
