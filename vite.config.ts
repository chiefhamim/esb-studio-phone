import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { pcCssScope } from './tools/pc-css-scope.ts'
import type { Plugin } from 'vite'

// Every import of the PC's Icon (src/pc/ui/Icon.tsx) gets the phone's Tabler icon instead (same API), so the vendored
// panels and the phone screens share one icon set while src/pc stays untouched. Type-only imports are unaffected.
function tablerIcons(): Plugin {
  const target = /[\\/]src[\\/]pc[\\/]ui[\\/]Icon(\.tsx)?$/
  const tabler = fileURLToPath(new URL('./src/mobile/shell/TablerIcon.tsx', import.meta.url))
  return {
    name: 'tabler-icons',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || /TablerIcon\.tsx$/.test(importer) || !/(^|\/)Icon$/.test(source)) return null
      const r = await this.resolve(source, importer, { ...options, skipSelf: true })
      return r && target.test(r.id.replace(/\?.*$/, '')) ? tabler : null
    },
  }
}

// Release builds only (dev keeps Vite's inline refresh script): no inline or remote script can run, so an HTML injection
// from a feed, the site or an AI answer cannot reach the native bridge (secure storage, publish). Network and images stay
// open: the app talks to many hosts (site, AI providers, Facebook, feeds) and those calls carry no script.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src * data: blob:",
  "media-src * data: blob:",
  "font-src 'self' data: https:",
  "connect-src * data: blob:",
  "frame-src 'self' about: blob: https:",
].join('; ')
function contentSecurityPolicy(): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// The vendored PC code (src/pc, see tools/sync-pc.mjs) reads __APP_VERSION__ and talks to window.esb; the phone
// installs its own window.esb (src/platform/esbShim.ts) before any vendored module runs.
export default defineConfig({
  base: './',
  plugins: [tablerIcons(), pcCssScope(), react(), contentSecurityPolicy()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { chunkSizeWarningLimit: 2500 },
})
