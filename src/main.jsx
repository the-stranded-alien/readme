import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(error => {
    console.warn('Offline support could not be enabled', error)
  }))
}

// In development, remove any service worker left over from a production
// preview on this address: it would keep serving old cached app files.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async registrations => {
    if (!registrations.length) return
    await Promise.all(registrations.map(registration => registration.unregister()))
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.filter(key => key.startsWith('readme-shell-')).map(key => caches.delete(key)))
    }
    // Reload once so this page is no longer served by the old worker.
    if (navigator.serviceWorker.controller) window.location.reload()
  }).catch(() => {})
}
