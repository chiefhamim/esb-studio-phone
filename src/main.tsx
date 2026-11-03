import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './mobile/pcStyles'
import './mobile/grid.css'
import './mobile/shell/shell.css'
import './mobile/shell/settings-kit.css'
import { initTheme } from './shell/theme'
import { bootPlatform } from './platform/boot'
import { notifyAppReady } from './platform/ota'
import './native/startup'

initTheme()

// storage, secrets, the old-draft migration and window.esb first; only then the app (and with it the vendored PC
// modules, which read storage when they load), then the active story's banner, then the first paint
async function start() {
  await bootPlatform()
  const [{ default: MobileApp }, { startStoryGraphics }] = await Promise.all([import('./mobile/MobileApp'), import('./mobile/library/storyGraphics')])
  await startStoryGraphics().catch((e) => console.warn('banner restore failed', e))
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MobileApp />
    </StrictMode>,
  )
  // Told "healthy" only once the app has really mounted and painted. An OTA bundle that dies during boot therefore never
  // reports itself ready, and Capgo rolls the phone back to the last good bundle instead of keeping a blank screen.
  requestAnimationFrame(() => requestAnimationFrame(() => void notifyAppReady()))
}

/** A boot that fails must say so and offer a way out, never leave a white screen. Plain DOM: React may be what failed. */
function showBootError(e: unknown) {
  console.error('boot failed', e)
  const root = document.getElementById('root')
  if (!root) return
  root.replaceChildren()
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.style.cssText = 'min-height:100%;display:grid;place-content:center;justify-items:center;gap:12px;padding:24px;text-align:center;font:16px/1.5 system-ui,sans-serif;color:#18181b;background:#fff'
  const h = document.createElement('b'); h.textContent = 'ESB Studio could not start'; h.style.fontSize = '20px'
  const p = document.createElement('p'); p.style.cssText = 'margin:0;max-width:30ch;color:#52525b'
  p.textContent = 'Nothing was deleted: your drafts and keys are still on this phone. Try again; if it keeps happening, restart the phone.'
  const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Try again'
  b.style.cssText = 'min-height:48px;padding:0 28px;border:0;border-radius:14px;background:#18181b;color:#fff;font:700 15px system-ui,sans-serif'
  b.onclick = () => location.reload()
  box.append(h, p, b)
  root.append(box)
}

start().catch(showBootError)
