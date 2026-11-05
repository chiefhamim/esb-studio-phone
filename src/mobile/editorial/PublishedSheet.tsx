// Tap a story in Published: everything you can do with it, not just "edit".
//   - see it: the website image and the Facebook post's image; open the article on esbpowerline.com or the Facebook post
//   - update it: the story (text, SEO, captions) or straight to its banner; Publish then updates the same article
//   - copy or share the link
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { LiveArticleSummary } from '../../pc/editorial/siteApi'
import { platform } from '../../platform/platform'
import { Button, Icon, Sheet } from '../shell/ui'
import { snack, useUi } from '../shell/core'
import { useNav } from '../shell/nav'
import { CatName, catOf } from '../shell/cat'
import { editLive, useDesk } from './deskStore'
import { findFbPost, type FbFind } from './fbLookup'
import { publishedParts } from './publishedDate'

const SHEET = 'ed-pub-item'
const usePick = create<{ art: LiveArticleSummary | null }>(() => ({ art: null }))

export function openPublishedItem(art: LiveArticleSummary) {
  usePick.setState({ art })
  useUi.getState().openSheet(SHEET)
}

function Pic({ src, label, onOpen, busy, empty }: { src?: string; label: string; onOpen?: () => void; busy?: boolean; empty: string }) {
  const [bad, setBad] = useState(false)
  return (
    <button type="button" className="pbs-pic" onClick={onOpen} disabled={!onOpen}>
      <span className="pbs-pic-img">
        {src && !bad ? <img src={src} alt="" decoding="async" onError={() => setBad(true)} /> : <span className="pbs-pic-empty">{busy ? <span className="m-spin" aria-label="Looking" /> : empty}</span>}
      </span>
      <span className="pbs-pic-label">{label}{onOpen && <Icon name="externalLink" size={13} />}</span>
    </button>
  )
}

export function PublishedSheet() {
  const art = usePick((s) => s.art)
  const open = useUi((s) => s.sheet === SHEET)
  const busy = useDesk((s) => s.busy)
  const [fb, setFb] = useState<FbFind | null>(null)
  useEffect(() => {
    if (!open || !art) return
    let live = true
    setFb(null)
    void findFbPost(art).then((r) => { if (live) setFb(r) })
    return () => { live = false }
  }, [open, art])
  if (!art) return null
  const { rel, when } = publishedParts(art.publishedAt)
  const c = catOf(art.category)
  const close = () => useUi.getState().closeSheet(SHEET)
  const ext = (u: string) => void platform().openExternal(u)
  const update = async (toBanner: boolean) => {
    close()
    await editLive(art)
    if (toBanner && useDesk.getState().view === 'story') useNav.getState().go('graphics')
  }
  const copy = () => { void navigator.clipboard?.writeText(art.link).then(() => snack('Link copied'), () => snack('Could not copy')) }
  const share = () => { const n = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }; if (n.share) void n.share({ title: art.title, url: art.link }).catch(() => undefined); else copy() }

  return (
    <Sheet id={SHEET} title="Published story" initial="full">
      <div className="pbs">
        <div className="pbs-head">
          <span className="pbs-kicker">{c ? <CatName cat={c} /> : art.category}</span>
          <h3 className="pbs-title" lang={/[ঀ-৿]/.test(art.title) ? 'bn' : undefined}>{art.title}</h3>
          <span className="pb-time">{rel && <span className="pb-ago">{rel}</span>}<span>{when}</span></span>
        </div>

        <div className="pbs-pics">
          <Pic src={art.imageUrl} label="Website" onOpen={() => ext(art.link)} empty="No image" />
          <Pic src={fb?.ok ? fb.post.image : undefined} label="Facebook" busy={!fb} onOpen={fb?.ok ? () => ext(fb.post.url) : undefined}
            empty={fb && !fb.ok ? 'Not found' : ''} />
        </div>
        {fb && !fb.ok && <p className="pbs-note">{fb.reason}</p>}

        <div className="pbs-group" role="group" aria-label="See it">
          <button type="button" className="pbs-act" onClick={() => ext(art.link)}><i><Icon name="globe" size={20} /></i><span><b>View on esbpowerline.com</b><small>{art.link.replace(/^https?:\/\//, '')}</small></span><Icon name="externalLink" size={16} /></button>
          <button type="button" className="pbs-act" disabled={!fb?.ok} onClick={() => fb?.ok && ext(fb.post.url)}>
            <i className="is-fb"><Icon name="link" size={20} /></i>
            <span><b>Open the Facebook post</b><small>{!fb ? 'Looking on the Page' : fb.ok ? (fb.remembered ? 'Posted from this phone' : 'Found on the Page by its headline') : 'Not found'}</small></span>
            <Icon name="externalLink" size={16} />
          </button>
        </div>

        <div className="pbs-group" role="group" aria-label="Update it">
          <button type="button" className="pbs-act" disabled={!!busy} onClick={() => void update(false)}><i className="is-edit"><Icon name="edit" size={20} /></i><span><b>Update the story</b><small>Text, SEO and captions; Publish updates this article</small></span><Icon name="chevRight" size={18} /></button>
          <button type="button" className="pbs-act" disabled={!!busy} onClick={() => void update(true)}><i className="is-banner"><Icon name="layers" size={20} /></i><span><b>Update the banner</b><small>Opens the story straight in Banner</small></span><Icon name="chevRight" size={18} /></button>
        </div>

        <div className="pbs-row2">
          <Button kind="tonal" icon="copy" onClick={copy}>Copy link</Button>
          <Button kind="tonal" icon="send" onClick={share}>Share</Button>
        </div>
      </div>
    </Sheet>
  )
}
