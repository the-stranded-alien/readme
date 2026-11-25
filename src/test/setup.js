import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { IDBFactory } from 'fake-indexeddb'

beforeEach(() => {
  localStorage.clear()
  const database = new IDBFactory()
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: database })
  vi.stubGlobal('indexedDB', database)
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  window.alert = vi.fn()
  window.prompt = vi.fn()
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  window.HTMLElement.prototype.scrollTo = vi.fn()
  window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0)
  window.cancelAnimationFrame = clearTimeout
  window.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal('IntersectionObserver', window.IntersectionObserver)
})

afterEach(() => {
  cleanup()
  delete window.Highlight
  delete window.ClipboardItem
  delete window.SpeechSynthesisUtterance
  delete window.BroadcastChannel
  delete window.getSelection
  delete window.navigator.wakeLock
  vi.unstubAllGlobals()
})
