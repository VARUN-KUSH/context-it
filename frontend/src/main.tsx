import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// BrowserRouter breaks in Electron (file:// protocol) because navigate('/')
// changes the URL to the filesystem root. HashRouter keeps index.html loaded.
const isElectron = window.location.protocol === 'file:'
const Router = isElectron ? HashRouter : BrowserRouter

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
)
