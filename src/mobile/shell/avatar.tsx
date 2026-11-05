// Profile picture: a preset avatar chosen on the phone and saved to the editor's esbpowerline.com profile
// (Supabase public.profiles.avatar_url, which the site already shows as the account's picture). The presets are ten
// DiceBear styles, 16 each, rendered to 256 px PNG (public/avatars/presets). The same files sit in the site's public
// media bucket at media/avatars/presets/<set>/NN.png; that public URL is what gets saved, so the picture is the same
// on the phone, the desktop app and the website. The phone shows its bundled copy of a preset (instant, offline).
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { SUPABASE_ANON_KEY, SUPABASE_URL, ensureFreshSession, type StaffSession } from '../../pc/editorial/siteApi'
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { snack, useUi } from './core'
import { Button, Chip, Icon, Sheet } from './ui'

export const AVATAR_REMOTE = `${SUPABASE_URL}/storage/v1/object/public/media/avatars/presets`
const LOCAL = './avatars/presets'
export const AVATAR_SETS = [
  { id: 'notionists', name: 'Notionists', by: 'Zoish', license: 'CC0' },
  { id: 'lorelei', name: 'Lorelei', by: 'Lisa Wischofsky', license: 'CC0' },
  { id: 'personas', name: 'Personas', by: 'Draftbit', license: 'CC BY 4.0' },
  { id: 'micah', name: 'Micah', by: 'Micah Lanier', license: 'CC BY 4.0' },
  { id: 'open-peeps', name: 'Open Peeps', by: 'Pablo Stanley', license: 'CC0' },
  { id: 'adventurer', name: 'Adventurer', by: 'Lisa Wischofsky', license: 'CC BY 4.0' },
  { id: 'avataaars', name: 'Avataaars', by: 'Pablo Stanley', license: 'free for commercial use' },
  { id: 'thumbs', name: 'Thumbs', by: 'DiceBear', license: 'CC0' },
  { id: 'shapes', name: 'Shapes', by: 'DiceBear', license: 'CC0' },
  { id: 'glass', name: 'Glass', by: 'DiceBear', license: 'CC0' },
] as const
export const AVATARS_PER_SET = 16

const file = (n: number) => String(n).padStart(2, '0') + '.png'
export const presetUrl = (set: string, n: number) => `${AVATAR_REMOTE}/${set}/${file(n)}`
/** What to draw for a saved URL: a preset's bundled copy when it is one of ours, else the URL itself. */
export const displayUrl = (url: string) => (url.startsWith(AVATAR_REMOTE + '/') ? LOCAL + url.slice(AVATAR_REMOTE.length) : url)

const cacheKey = (uid: string) => `esb.avatar.${uid}`

interface AvatarState {
  userId: string | null
  url: string | null
  saving: string | null
  load: (session: StaffSession | null) => Promise<void>
  choose: (url: string | null) => Promise<boolean>
}

async function profileRequest(method: 'GET' | 'PATCH', body?: unknown): Promise<Response | null> {
  const s = await ensureFreshSession(useEditorialStore.getState().staffSession)
  if (!s?.token || !s.userId) return null
  return fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(s.userId)}${method === 'GET' ? '&select=avatar_url' : ''}`, {
    method,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.token}`, Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export const useAvatar = create<AvatarState>((set, get) => ({
  userId: null,
  url: null,
  saving: null,
  load: async (session) => {
    const uid = session?.userId ?? null
    if (!uid) { set({ userId: null, url: null }); return }
    if (get().userId !== uid) set({ userId: uid, url: localStorage.getItem(cacheKey(uid)) })
    try {
      const res = await profileRequest('GET')
      if (!res?.ok) return
      const row = ((await res.json()) as { avatar_url: string | null }[])[0]
      if (!row || get().userId !== uid) return
      set({ url: row.avatar_url })
      if (row.avatar_url) localStorage.setItem(cacheKey(uid), row.avatar_url); else localStorage.removeItem(cacheKey(uid))
    } catch { /* offline: keep the cached picture */ }
  },
  choose: async (url) => {
    const uid = get().userId
    if (!uid) return false
    const before = get().url
    set({ url, saving: url ?? 'none' })
    try {
      const res = await profileRequest('PATCH', { avatar_url: url, updated_at: new Date().toISOString() })
      const rows = res?.ok ? ((await res.json()) as { avatar_url: string | null }[]) : []
      if (rows.length !== 1 || rows[0].avatar_url !== url) throw new Error('not saved')
      if (url) localStorage.setItem(cacheKey(uid), url); else localStorage.removeItem(cacheKey(uid))
      return true
    } catch {
      set({ url: before })
      return false
    } finally {
      set({ saving: null })
    }
  },
}))

/** Keeps the picture in step with whoever is signed in (call once, high in the tree). */
export function useAvatarSync() {
  const session = useEditorialStore((s) => s.staffSession)
  const load = useAvatar((s) => s.load)
  useEffect(() => { void load(session) }, [session?.userId]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** The signed-in editor's picture, or their initial when they have none. */
export function UserAvatar({ name, className = '' }: { name: string; className?: string }) {
  const url = useAvatar((s) => s.url)
  return url
    ? <img className={'u-avatar ' + className} src={displayUrl(url)} alt="" draggable={false} />
    : <span className={'u-avatar is-initial ' + className}>{(name || '?').slice(0, 1).toUpperCase()}</span>
}

export function openAvatarPicker() { useUi.getState().openSheet('avatar') }

export function AvatarSheet() {
  const open = useUi((s) => s.sheet === 'avatar')
  const session = useEditorialStore((s) => s.staffSession)
  const url = useAvatar((s) => s.url)
  const saving = useAvatar((s) => s.saving)
  const choose = useAvatar((s) => s.choose)
  const current = url?.startsWith(AVATAR_REMOTE + '/') ? url.slice(AVATAR_REMOTE.length + 1).split('/')[0] : null
  const [setId, setSetId] = useState<string>(current ?? AVATAR_SETS[0].id)
  useEffect(() => { if (open && current) setSetId(current) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const meta = AVATAR_SETS.find((s) => s.id === setId) ?? AVATAR_SETS[0]
  const pick = async (next: string | null) => {
    if (saving) return
    const ok = await choose(next)
    snack(ok ? (next ? 'Profile picture updated on esbpowerline.com' : 'Profile picture removed') : 'Could not save the picture. Check the connection and try again')
  }
  const name = session ? session.name || session.email : ''
  return (
    <Sheet id="avatar" title="Profile picture" initial="full">
      {!session ? <p className="me-hint">Sign in with your esbpowerline.com account to choose a picture.</p> : (
        <div className="av">
          <section className="av-hero">
            <UserAvatar name={name} className="av-big" />
            <span className="av-hero-txt"><strong>{name}</strong><small>Saved to your esbpowerline.com profile</small></span>
          </section>
          <div className="av-sets" role="tablist" aria-label="Avatar sets">
            {AVATAR_SETS.map((s) => <Chip key={s.id} on={s.id === setId} onClick={() => setSetId(s.id)}>{s.name}</Chip>)}
          </div>
          <div className="av-grid">
            {Array.from({ length: AVATARS_PER_SET }, (_, i) => {
              const u = presetUrl(setId, i + 1)
              const on = url === u
              return (
                <button key={u} type="button" className={'av-cell' + (on ? ' is-on' : '') + (saving === u ? ' is-saving' : '')} aria-pressed={on} aria-label={`${meta.name} ${i + 1}`} onClick={() => void pick(u)}>
                  <img src={displayUrl(u)} alt="" loading="lazy" draggable={false} />
                  {on && <span className="av-tick" aria-hidden><Icon name="check" size={14} strokeWidth={3} /></span>}
                </button>
              )
            })}
          </div>
          <p className="av-credit">{meta.name} by {meta.by} · {meta.license} · via DiceBear</p>
          {url && <Button kind="text" icon="trash" className="av-remove" onClick={() => void pick(null)}>Remove picture</Button>}
        </div>
      )}
    </Sheet>
  )
}
