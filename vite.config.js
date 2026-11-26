import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import process from 'node:process'
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
      const EXPORT_ONLY = /node_modules\/(pdfmake|mathjax-full|docx|pptxgenjs)\/|\/src\/(pdfExport|docxExport|htmlExport|pptxExport)\.js$/
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

// Each deploy gets its own id: the service worker's cache name changes with it, so browsers
// notice the new version, re-cache the app and drop the old cache.
const BUILD_ID = (process.env.GITHUB_SHA || '').slice(0, 12) || Date.now().toString(36)

function deploySafety() {
  return {
    name: 'readme-deploy-safety',
    apply: 'build',
    generateBundle(_options, bundle) {
      // Every built file, so the next deploy can keep this one's files for tabs still running it.
      const assets = Object.keys(bundle).filter(fileName => fileName.startsWith('assets/'))
      this.emitFile({ type: 'asset', fileName: 'asset-manifest.json', source: JSON.stringify({ build: BUILD_ID, assets }) })
    },
    writeBundle(options) {
      const swPath = `${options.dir}/sw.js`
      writeFileSync(swPath, readFileSync(swPath, 'utf8').replace(/__BUILD_ID__/g, BUILD_ID))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), offlinePrecacheManifest(), deploySafety()],
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
