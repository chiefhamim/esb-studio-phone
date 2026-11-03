import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/tokens.css'
import './ui/kit/kit.css'
import './index.css'
import './layout.css'
import './ui/shell.css'
import './ui/home.css'
import { initTheme } from './shell/theme'
import { bootPlatform } from './platform/boot'
import './native/startup'

initTheme()

const isGallery = typeof window !== 'undefined' && window.location.search.includes('gallery')

// storage, secrets and window.esb first; only then the app (and with it the vendored PC modules) is loaded
void bootPlatform().then(async () => {
  const [{ default: App }, { Gallery }] = await Promise.all([import('./App.tsx'), import('./ui/kit/Gallery')])
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {isGallery ? <Gallery /> : <App />}
    </StrictMode>,
  )
})
