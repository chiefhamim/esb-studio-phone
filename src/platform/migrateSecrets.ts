// One-way, non-destructive upgrade of the phone's existing Keystore secrets into the shapes the vendored PC code
// reads. The old secrets are NOT deleted (nothing on the phone is thrown away); the PC-shaped copies are written only
// when they do not exist yet, so an editor's later change on the new screens is never overwritten.
import { getSecret, setSecret } from '../secure'

type Session = Record<string, unknown> & { token?: unknown; refreshToken?: unknown; email?: unknown; authType?: unknown }

/** The PC discards a stored session without authType 'supabase'; the phone's own sign-in never wrote that field. */
export function upgradeSession(raw: string, nowIso = new Date().toISOString()): string | null {
  let s: Session
  try { s = JSON.parse(raw) as Session } catch { return null }
  if (!s || typeof s.token !== 'string' || typeof s.email !== 'string') return null
  if (s.authType === 'supabase' && typeof s.authenticatedAt === 'string') return null
  return JSON.stringify({ ...s, authType: 'supabase', authenticatedAt: typeof s.authenticatedAt === 'string' ? s.authenticatedAt : nowIso })
}

export function aiSettingsFromPhoneKeys(keys: { gemini?: string | null; anthropic?: string | null; openai?: string | null }): string | null {
  const k = { gemini: keys.gemini?.trim() ?? '', anthropic: keys.anthropic?.trim() ?? '', openai: keys.openai?.trim() ?? '', openrouter: '' }
  if (!k.gemini && !k.anthropic && !k.openai) return null
  const provider = k.gemini ? 'gemini' : k.anthropic ? 'anthropic' : 'openai'
  return JSON.stringify({ provider, seo: '', social: '', outreach: '', research: '', review: '', keys: k, models: { gemini: 'auto', anthropic: 'auto', openai: 'auto', openrouter: 'auto' }, prompt: '', paused: false })
}

export async function migrateSecrets(): Promise<{ session: boolean; ai: boolean; facebook: boolean }> {
  const done = { session: false, ai: false, facebook: false }
  const session = await getSecret('site-session')
  if (session) {
    const up = upgradeSession(session)
    if (up) { await setSecret('site-session', up); done.session = true }
  }
  if (!(await getSecret('pc-ai-settings'))) {
    const [gemini, anthropic, openai] = await Promise.all([getSecret('gemini-key'), getSecret('claude-key'), getSecret('openai-key')])
    const s = aiSettingsFromPhoneKeys({ gemini, anthropic, openai })
    if (s) { await setSecret('pc-ai-settings', s); done.ai = true }
  }
  if (!(await getSecret('pc-facebook'))) {
    const [pageId, token] = await Promise.all([getSecret('fb-page-id'), getSecret('fb-page-token')])
    if (pageId && token && /^\d{5,}$/.test(pageId.trim())) { await setSecret('pc-facebook', JSON.stringify({ pageId: pageId.trim(), token: token.trim() })); done.facebook = true }
  }
  return done
}
