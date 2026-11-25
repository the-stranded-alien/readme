import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function offlinePrecacheManifest() {
  return {
    name: 'readme-offline-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter(fileName => fileName !== 'sw.js' && !fileName.endsWith('.map'))
        .map(fileName => `/${fileName}`)
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: JSON.stringify(files),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), offlinePrecacheManifest()],
  base: '/',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@codemirror') || id.includes('@uiw/react-codemirror') || id.includes('@uiw/codemirror') || id.includes('@lezer')) return 'codemirror'
          if (id.includes('react-markdown') || id.includes('remark') || id.includes('rehype') || id.includes('unified') || id.includes('mdast') || id.includes('hast')) return 'markdown'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
        },
      },
    },
  },
})
