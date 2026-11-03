import { IconLayers, IconNewspaper } from '../shell/icons'

/** The desktop's front door, for a phone: wordmark, tagline and the two desks that exist here. */
export default function Launcher({ onEditorial, onGraphics }: { onEditorial: () => void; onGraphics: () => void }) {
  return (
    <>
      <header className="hm-hero">
        <h1 className="hm-title" aria-label="ESB Power Line Ai Studio">
          <img className="hm-mark" src="/brand/esb-logo.png" alt="" aria-hidden width="291" height="101" decoding="async" />
          <span className="hm-typed" aria-hidden><b>ESB</b><span className="hm-pl"><span>POWER</span><span>LINE</span></span></span>
          <span className="hm-stick" aria-hidden />
          <span className="hm-name"><span className="hm-ai">Ai</span> <span className="hm-studio">Studio</span></span>
        </h1>
        <p className="hm-sub">Where stories are written, imagination is designed and reality is cut</p>
      </header>
      <nav className="hm-launch" aria-label="Workspaces">
        <button type="button" className="hm-tile" onClick={onEditorial}>
          <span className="hm-tile-ico"><IconNewspaper /></span>
          <span className="hm-tile-name">Editorial</span>
          <span className="hm-tile-note">Link in, English story out</span>
        </button>
        <button type="button" className="hm-tile" onClick={onGraphics}>
          <span className="hm-tile-ico"><IconLayers /></span>
          <span className="hm-tile-name">Graphics</span>
          <span className="hm-tile-note">Banners and cards</span>
        </button>
      </nav>
    </>
  )
}
