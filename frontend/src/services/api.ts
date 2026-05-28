import axios from 'axios'

// In Electron the page is loaded from file:// — no Vite proxy exists.
// Testers connect to the shared backend; URL is set via VITE_BACKEND_URL in .env.
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:'
const DEFAULT_BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function getBaseURL(): string {
  if (!isElectron) return '/api'
  const stored = localStorage.getItem('backend_url')
  return stored ? stored.replace(/\/$/, '') : DEFAULT_BACKEND
}

const api = axios.create({ baseURL: getBaseURL() })

// Re-read on every request so a URL change in Settings takes effect immediately.
api.interceptors.request.use((config) => {
  if (isElectron) config.baseURL = getBaseURL()
  return config
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ─────────────────────────────────────────────────────────────────────
export const login = (username: string, password: string) =>
  api.post('/auth/login', new URLSearchParams({ username, password }))

export const register = (email: string, username: string, password: string) =>
  api.post('/auth/register', { email, username, password })

export const getMe = () => api.get('/auth/me')

export const updatePersona = (persona: string) =>
  api.patch('/auth/persona', { persona })

// ── Accounts ──────────────────────────────────────────────────────────────────
export const getAccounts = () => api.get('/accounts/')
export const addAccount = (data: any) => api.post('/accounts/', data)
export const syncAccount = (id: number) => api.post(`/accounts/${id}/sync`)
export const deleteAccount = (id: number) => api.delete(`/accounts/${id}`)

// ── Fans ──────────────────────────────────────────────────────────────────────
export const getFans = (
  accountId: number,
  params: { search?: string; offset?: number; limit?: number } = {},
) => api.get('/fans/', { params: { account_id: accountId, ...params } })

export const getFan = (fanId: string) => api.get(`/fans/${fanId}`)

export const updateFanNotes = (fanId: string, notes: string) =>
  api.patch(`/fans/${fanId}/notes`, { manual_notes: notes })

export const updateFanTags = (fanId: string, tagIds: number[]) =>
  api.patch(`/fans/${fanId}/tags`, { tag_ids: tagIds })

export const summarizeFan = (fanId: string) =>
  api.post(`/fans/${fanId}/summarize`)

// ── Tags ──────────────────────────────────────────────────────────────────────
export const getTags = () => api.get('/fans/tags/all')
export const createTag = (name: string, color?: string) =>
  api.post('/fans/tags/', { name, color })

// ── Messages ──────────────────────────────────────────────────────────────────
export const getMessages = (
  fanId: string,
  params: { limit?: number; before_id?: string } = {},
) => api.get(`/messages/${fanId}`, { params: { limit: 50, ...params } })

export const sendMessage = (fanId: string, content: string, price?: number) =>
  api.post(`/messages/${fanId}/send`, { content, price })

export const sendTypingIndicator = (fanId: string) =>
  api.post(`/messages/${fanId}/typing`)

export const getFanChats = (accountId: number) =>
  api.get('/fans/chats', { params: { account_id: accountId } })

// ── Suggestions ───────────────────────────────────────────────────────────────
export const getSuggestions = (fanId: string, force = false) =>
  api.get(`/suggestions/${fanId}`, { params: { force } })

export const markSuccessful = (suggestionId: number, resultNote?: string) =>
  api.post('/fans/successful-messages/mark', {
    suggestion_id: suggestionId,
    result_note: resultNote,
  })

// ── Vault ─────────────────────────────────────────────────────────────────────
export const getVault = (accountId: string) =>
  api.get('/vault/', { params: { of_user_id: accountId } })
