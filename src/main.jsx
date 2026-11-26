import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// A newer version of ReadMe is available: either the service worker found a new deploy, or a
// file this (older) page needs is gone from the server. The app shows a "Reload" toast.
const announceUpdate = reason => window.dispatchEvent(new CustomEvent('readme:update-available', { detail: { reason } }))

// Lazily loaded code (exports, diagrams…) failed to load — usually because ReadMe was updated
// since this tab opened. Vite fires this before the import's own error handling runs.
window.addEventListener('vite:preloadError', () => announceUpdate('stale-file'))

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').then(registration => {
    // Look for a new deploy whenever the tab comes back into view (and hourly).
    const check = () => registration.update().catch(() => {})
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    setInterval(check, 60 * 60 * 1000)
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing
      worker?.addEventListener('statechange', () => {
        // Installed while an older version controls this page: a new version is ready.
        if (worker.state === 'installed' && navigator.serviceWorker.controller) announceUpdate('new-version')
      })
    })
  }).catch(error => {
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
