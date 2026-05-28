import { useStore } from '../store'

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let currentToken: string | null = null
// Track auto-clear timers for fan typing (fan stops → clear after 5 s)
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Track auto-clear timers for fan online status (mark offline after 5 min of no ping)
const onlineTimers = new Map<string, ReturnType<typeof setTimeout>>()

function handleEvent(raw: string) {
  let event: { type: string; fan_id?: string; message_id?: string; message?: any }
  try { event = JSON.parse(raw) } catch { return }

  console.log('[WS] event received:', event)

  const store = useStore.getState()
  const { type, fan_id } = event

  // ── Fan typing ────────────────────────────────────────────────────────────
  if (type === 'fan.typing' && fan_id) {
    store.setFanTyping(fan_id, true)
    if (typingTimers.has(fan_id)) clearTimeout(typingTimers.get(fan_id)!)
    typingTimers.set(fan_id, setTimeout(() => {
      useStore.getState().setFanTyping(fan_id, false)
      typingTimers.delete(fan_id)
    }, 5000))
  }

  // ── Fan online ────────────────────────────────────────────────────────────
  if (type === 'fan.online' && fan_id) {
    store.setFanOnline(fan_id, true)
    // Auto-mark offline after 5 min if no further online ping
    if (onlineTimers.has(fan_id)) clearTimeout(onlineTimers.get(fan_id)!)
    onlineTimers.set(fan_id, setTimeout(() => {
      useStore.getState().setFanOnline(fan_id, false)
      onlineTimers.delete(fan_id)
    }, 5 * 60 * 1000))
  }

  // ── Fan offline ───────────────────────────────────────────────────────────
  if (type === 'fan.offline' && fan_id) {
    store.setFanOnline(fan_id, false)
    if (onlineTimers.has(fan_id)) {
      clearTimeout(onlineTimers.get(fan_id)!)
      onlineTimers.delete(fan_id)
    }
  }

  // ── New message (received or sent) ────────────────────────────────────────
  if (type === 'message.new' && event.message) {
    const msgFanId = event.message.fan_id as string
    // Clear typing indicator — they just sent a message
    if (!event.message.from_creator && msgFanId) {
      if (typingTimers.has(msgFanId)) {
        clearTimeout(typingTimers.get(msgFanId)!)
        typingTimers.delete(msgFanId)
      }
      store.setFanTyping(msgFanId, false)
    }
    store.setLastWsMessage(event.message)
  }

  // ── Message deleted ───────────────────────────────────────────────────────
  if (type === 'message.deleted' && event.message_id) {
    store.setDeletedMessageId(event.message_id, event.fan_id)
  }
}

export function connectWebSocket(token: string) {
  if (socket?.readyState === WebSocket.OPEN && token === currentToken) return
  disconnectWebSocket()

  currentToken = token
  const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:'
  let wsBase = ''
  if (isElectron) {
    const defaultBackend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
    const stored = (localStorage.getItem('backend_url') || defaultBackend).replace(/\/$/, '')
    wsBase = stored.replace(/^http/, 'ws')
  }
  socket = new WebSocket(`${wsBase}/ws?token=${encodeURIComponent(token)}`)

  socket.onopen = () => {
    console.log('[WS] connected ✓')
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    // Send periodic keep-alive pings every 30 s
    const ping = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send('ping')
      else clearInterval(ping)
    }, 30_000)
  }

  socket.onmessage = (e) => handleEvent(e.data)

  socket.onclose = (e) => {
    console.warn('[WS] closed code=%d — reconnecting in 3 s', e.code)
    if (currentToken) {
      reconnectTimer = setTimeout(() => connectWebSocket(currentToken!), 3000)
    }
  }

  socket.onerror = (e) => { console.error('[WS] error', e); socket?.close() }
}

export function disconnectWebSocket() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  socket?.close()
  socket = null
  currentToken = null
}
