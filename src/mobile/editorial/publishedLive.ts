// The Published list, read straight from the site's database instead of its public feed.
//
// Found on 2026-11-05: esbpowerline.com/feed.xml is served from the CDN cache (X-Vercel-Cache: HIT, Age ~14 min, and a
// cache-busting query does not get past it). A story published from the phone was missing from Published for up to a
// quarter of an hour, so the sync button looked broken. The Article table answers with what is live this second.
// Falls back to the feed (the old path) when the database cannot be reached.
import { useEditorialStore } from '../../pc/editorial/editorialStore'
import { SUPABASE_ANON_KEY, SUPABASE_URL, ensureFreshSession, type LiveArticleSummary } from '../../pc/editorial/siteApi'

interface Row { title: string; slug: string; category: string | null; publishedAt: string | null; excerpt: string | null; imageUrl: string | null; postAsNewsDesk: boolean | null }

const SITE = 'https://esbpowerline.com'

async function fromDatabase(): Promise<LiveArticleSummary[] | null> {
  const session = await ensureFreshSession(useEditorialStore.getState().staffSession).catch(() => null)
  const token = session?.token || SUPABASE_ANON_KEY
  const q = 'status=eq.PUBLISHED&select=title,slug,category,publishedAt,excerpt,imageUrl,postAsNewsDesk&order=publishedAt.desc&limit=80'
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Article?${q}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) return null
  const rows = (await res.json()) as Row[]
  return rows.filter((r) => r.title && r.slug).map((r) => ({
    title: r.title,
    slug: r.slug,
    link: `${SITE}/articles/${r.slug}`,
    category: r.category || 'General',
    publishedAt: r.publishedAt ? new Date(r.publishedAt.endsWith('Z') ? r.publishedAt : r.publishedAt + 'Z').toUTCString() : '',
    description: r.excerpt ?? undefined,
    imageUrl: r.imageUrl ?? undefined,
    author: r.postAsNewsDesk ? 'ESB News Desk' : undefined,
  }))
}

/** Refresh Published. Returns what happened, in words the editor can read. */
export async function syncPublished(): Promise<{ ok: boolean; message: string }> {
  const st = useEditorialStore.getState()
  const before = new Set(st.liveArticles.map((a) => a.slug))
  let list: LiveArticleSummary[] | null = null
  try { list = await fromDatabase() } catch { list = null }
  if (!list) {
    // the database did not answer: the public feed (may be up to ~15 minutes behind)
    const old = st.liveArticles
    await st.syncFromLiveFeed().catch(() => undefined)
    const after = useEditorialStore.getState().liveArticles
    // the same list object back means the feed did not answer either: nothing was refreshed
    return after.length && after !== old ? { ok: true, message: 'Updated from the site feed (it can lag a few minutes)' } : { ok: false, message: 'Could not reach esbpowerline.com. Check the connection and try again.' }
  }
  if (!list.length) return { ok: false, message: 'The site returned no published stories.' }
  const categories = [...new Set(list.map((a) => a.category))]
  useEditorialStore.setState({ liveArticles: list, siteCategories: categories })
  const fresh = list.filter((a) => !before.has(a.slug)).length
  return { ok: true, message: before.size === 0 ? `${list.length} published stories` : fresh > 0 ? `${fresh} new ${fresh === 1 ? 'story' : 'stories'} · up to date` : 'Up to date' }
}
