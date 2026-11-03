import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// The vendored PC code (src/pc, see tools/sync-pc.mjs) reads __APP_VERSION__ and talks to window.esb; the phone
// installs its own window.esb (src/platform/esbShim.ts) before any vendored module runs.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { chunkSizeWarningLimit: 2500 },
})
