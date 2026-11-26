// The build id in the cache name is filled in at build time (vite.config.js), so every deploy
// is a new worker with its own cache; the old cache is removed when it activates.
const CACHE_NAME = 'readme-shell-__BUILD_ID__'
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
// Web Share Target: the OS share sheet POSTs here. Stash what was shared in the
// cache and redirect to the app, which picks it up on load.
const SHARE_INBOX = '/__share-inbox__'
async function receiveShare(request) {
  const form = await request.formData()
  const files = []
  for (const file of form.getAll('files')) {
    if (file && typeof file.text === 'function') files.push({ name: file.name || 'Shared.md', content: await file.text() })
  }
  const shared = {
    title: String(form.get('title') || ''),
    text: String(form.get('text') || ''),
    url: String(form.get('url') || ''),
    files,
    at: Date.now(),
  }
  const cache = await caches.open(CACHE_NAME)
  const previous = await cache.match(SHARE_INBOX)
  const inbox = previous ? await previous.json() : []
  inbox.push(shared)
  await cache.put(SHARE_INBOX, new Response(JSON.stringify(inbox), { headers: { 'Content-Type': 'application/json' } }))
  return Response.redirect('/?shared=1', 303)
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method === 'POST' && new URL(request.url).pathname === '/share-target') {
    event.respondWith(receiveShare(request).catch(() => Response.redirect('/?shared=error', 303)))
    return
  }
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (!response.ok) throw new Error('Navigation request failed')
      const copy = response.clone()
      caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy))
      return response
    }).catch(async () => (await caches.match(request, { ignoreVary: true })) || caches.match('/index.html', { ignoreVary: true })))
    return
  }
  event.respondWith((async () => {
    // ignoreVary: module scripts are requested with an Origin header that the
    // precache requests didn't have, so "Vary: Origin" would otherwise miss.
    const cached = await caches.match(request, { ignoreVary: true })
    if (cached) return cached
    try {
      const response = await fetch(request)
      // Clone before handing the response to the page (its body can only be read once).
      if (response.ok) {
        const copy = response.clone()
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)))
      }
      return response
    } catch {
      return Response.error()
    }
  })())
})
