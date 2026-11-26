// Installing ReadMe as an app (PWA): is it installed, can the browser install it, and install it.
import { useCallback, useEffect, useState } from 'react'

const INSTALLED_KEY = 'readme-app-installed'
const isStandalone = () => typeof window !== 'undefined' && (
  window.matchMedia?.('(display-mode: standalone)').matches
  || window.matchMedia?.('(display-mode: window-controls-overlay)').matches
  || window.navigator.standalone === true
)
const readFlag = () => { try { return localStorage.getItem(INSTALLED_KEY) === '1' } catch { return false } }
const writeFlag = value => { try { if (value) localStorage.setItem(INSTALLED_KEY, '1'); else localStorage.removeItem(INSTALLED_KEY) } catch { /* optional */ } }

/**
 * { status, standalone, install }:
 *  - status 'installed': running as the app, or the browser says it's installed;
 *  - status 'available': the browser can install it now (install() shows its prompt);
 *  - status 'unavailable': this browser can't install it from here (see the browser menu).
 */
export function useAppInstall() {
  const [prompt, setPrompt] = useState(null)
  const [installed, setInstalled] = useState(() => isStandalone() || readFlag())
  const standalone = isStandalone()

  useEffect(() => {
    // The browser only offers the install prompt when the app is NOT installed.
    const onBeforeInstall = event => { event.preventDefault(); setPrompt(event); setInstalled(isStandalone()); writeFlag(false) }
    const onInstalled = () => { setPrompt(null); setInstalled(true); writeFlag(true) }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    // Chrome can also tell a page whether its own app is installed.
    navigator.getInstalledRelatedApps?.().then(apps => {
      if (apps?.some(app => app.platform === 'webapp')) { setInstalled(true); writeFlag(true) }
    }).catch(() => {})
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!prompt) return false
    let accepted = false
    try {
      await prompt.prompt()
      accepted = (await prompt.userChoice)?.outcome === 'accepted'
    } catch { /* the browser may cancel or dismiss the prompt */ }
    setPrompt(null)
    if (accepted) { setInstalled(true); writeFlag(true) }
    return accepted
  }, [prompt])

  const status = installed ? 'installed' : prompt ? 'available' : 'unavailable'
  return { status, standalone, install }
}
