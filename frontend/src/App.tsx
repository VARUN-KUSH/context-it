import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import LoginPage from './pages/Login'
import DashboardPage from './pages/Dashboard'
import SettingsPage from './pages/Settings'
import { connectWebSocket, disconnectWebSocket } from './services/websocket'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')

  useEffect(() => {
    if (token) connectWebSocket(token)
    return () => disconnectWebSocket()
  }, [token])

  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1a1a1a', color: '#fff', border: '1px solid #333' },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <SettingsPage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  )
}
