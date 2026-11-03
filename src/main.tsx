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

void notifyAppReady()
initTheme()

// storage, secrets, the old-draft migration and window.esb first; only then the app (and with it the vendored PC
// modules, which read storage when they load), then the active story's banner, then the first paint
void bootPlatform().then(async () => {
  const [{ default: MobileApp }, { startStoryGraphics }] = await Promise.all([import('./mobile/MobileApp'), import('./mobile/library/storyGraphics')])
  await startStoryGraphics().catch((e) => console.warn('banner restore failed', e))
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MobileApp />
    </StrictMode>,
  )
})
