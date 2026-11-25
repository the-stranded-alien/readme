const CACHE_NAME = 'readme-shell-v2'
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/precache-manifest.json'])
    const manifestResponse = await fetch('/precache-manifest.json')
    if (!manifestResponse.ok) throw new Error('Could not load the offline asset manifest')
    const assets = await manifestResponse.json()
    if (Array.isArray(assets) && assets.length) await cache.addAll(assets)
  })())
  self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('readme-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))))
  self.clients.claim()
})
self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (!response.ok) throw new Error('Navigation request failed')
      const copy = response.clone()
      caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy))
      return response
    }).catch(async () => (await caches.match(request)) || caches.match('/index.html')))
    return
  }
  event.respondWith((async () => {
    const cached = await caches.match(request)
    if (cached) return cached
    try {
      const response = await fetch(request)
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
      return response
    } catch {
      return Response.error()
    }
  })())
})
