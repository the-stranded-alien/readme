// Share links: the Markdown is deflate-compressed and stored in the URL
// fragment (#share=…), which browsers never send to the server.

const toBase64Url = bytes => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = text => {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}
async function pipe(bytes, stream) {
  const response = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await response.arrayBuffer())
}

export async function encodeSharePayload(markdown) {
  const bytes = new TextEncoder().encode(markdown)
  if (typeof CompressionStream === 'function') {
    try { return `d1.${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}` } catch { /* fall through */ }
  }
  return `u1.${toBase64Url(bytes)}`
}

export async function decodeSharePayload(payload) {
  const [version, data] = [payload.slice(0, 3), payload.slice(3)]
  const bytes = fromBase64Url(data)
  if (version === 'd1.') return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')))
  if (version === 'u1.') return new TextDecoder().decode(bytes)
  throw new Error('Unsupported share link')
}

export async function buildShareUrl(markdown, name) {
  const payload = await encodeSharePayload(markdown)
  const params = new URLSearchParams({ name: name || 'Shared.md' })
  return `${window.location.origin}${window.location.pathname}#share=${payload}&${params}`
}

/** Reads a share link from a URL fragment; returns null when there is none. */
export async function readShareFromHash(hash) {
  if (!hash || !hash.includes('share=')) return null
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const payload = params.get('share')
  if (!payload) return null
  const content = await decodeSharePayload(payload)
  return { name: (params.get('name') || 'Shared.md').slice(0, 120), content }
}
