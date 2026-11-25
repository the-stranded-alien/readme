import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const catSoundFiles = readdirSync(fileURLToPath(new URL('./public/cat-sounds/', import.meta.url)))
  .filter(fileName => fileName.endsWith('.ogg'))
  .map(fileName => `/cat-sounds/${fileName}`)

function offlinePrecacheManifest() {
  return {
    name: 'readme-offline-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      // Export-only libraries (PDF, math, Word) aren't precached: the service
      // worker caches them on first use, keeping the offline install small.
      const EXPORT_ONLY = /node_modules\/(pdfmake|mathjax-full|docx)\/|\/src\/(pdfExport|docxExport|htmlExport)\.js$/
      const isExportOnly = item => item.type === 'chunk' && Object.keys(item.modules).length > 0
        && Object.keys(item.modules).every(id => EXPORT_ONLY.test(id.replace(/\\/g, '/')))
      const files = Object.entries(bundle)
        .filter(([fileName, item]) => fileName !== 'sw.js' && !fileName.endsWith('.map') && !isExportOnly(item))
        .map(([fileName]) => `/${fileName}`)
      files.push(...catSoundFiles)
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
