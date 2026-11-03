import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/tokens.css'
import './ui/kit/kit.css'
import './index.css'
import './layout.css'
import './ui/shell.css'
import './ui/home.css'
import App from './App.tsx'
import { Gallery } from './ui/kit/Gallery'
import { initTheme } from './shell/theme'

initTheme()

const isGallery = typeof window !== 'undefined' && window.location.search.includes('gallery')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isGallery ? <Gallery /> : <App />}
  </StrictMode>,
)
import './native/startup'
