# Site connectivity: phone vs PC (written 2026-11-03)

Supersedes the gaps in `docs/PUBLISH_GAPS.md`. Code: `src/sync/*`, `src/publish/site.ts`, `src/fetchArticle.ts`. Site branch: `phone-bearer-api` in `C:\Users\User\esbpowerline` (local, one commit, NOT pushed, NOT deployed).

## Audit: every PC feature that talks to the site

| PC feature | Phone status |
|---|---|
| Sign-in (Supabase password grant, `profiles` role/status checks) | Works. Settings, `signIn`. Password never stored; session in Keystore only (`site-session`). |
| Session refresh (single-use refresh token, one at a time, 5 min before expiry) | Works, same rules. `refreshSession` now tells `expired` (refresh refused) from `unavailable` (network). |
| Live connection state | Works. `checkConnection`: Connected / Session expired / Offline / Not connected. Status bar + Settings show it; re-checked on foreground, network change, every 90 s. |
| Save draft / publish / update an existing story (REST `Article`, bearer + anon key) | Works (unchanged). Live publish still needs the second-tap confirmation. |
| "Published" list, open one to update | Works once signed in: `src/sync/published.ts` (REST read, RLS "Staff view all articles"). Stories saved as JSON by the CMS rich editor are refused with a plain message. |
| Picture upload to the media library (`/api/upload`) | Code done. Live only after the site branch is deployed (probe turns the button on; until then "Planned"). 4 MB cap checked on the phone. |
| Cache revalidate after publish (`/api/cms/revalidate`) | Code done, same probe. Best effort, never undoes a publish. |
| Article fetch for a pasted link | Code done (`/api/staff/fetch-article`, new). Until live: the honest "not connected, paste the text" message. |
| Wire inbox / feeds | Planned. The PC polls RSS/Atom/sitemaps through its Electron main process; a WebView cannot (CORS) and the new site route only returns HTML pages. Needs a feed route (or the native HTTP plugin). Not built. |
| Facebook post | Unchanged: Graph from the WebView with the Page token. CORS with the Bearer header is still unconfirmed on the real phone. |
| Slug availability check, probe keep-alive | Slug clash is reported by the save (`23505`). The PC's 20 s keep-alive is replaced by the 90 s connection check. |
| "Open the CMS" signed in (cookie injection) | Not applicable on a phone. |

## Supabase facts used (read from the repo, not changed)
`public."Article"` RLS (`supabase/setup-articles-rls.sql`): staff select all, staff insert/update, admin delete. `profiles` readable by the owner. The Supabase MCP tools in this session were unauthenticated, so no live policy listing was done; the SQL files in the site repo are the source.

## Site branch `phone-bearer-api` (commit 09025e1cf)
- `lib/supabase/bearer.ts` (new): strict `Authorization: Bearer <jwt>` parsing; `verifyBearerUser` = `supabase.auth.getUser(token)` on a client that sends the token (so the `profiles` read runs as that user).
- `lib/auth.ts`: `auth()` uses the bearer when the header is present (verified, then the same `resolveAppUser` profile/status/role/Prisma checks). A bad token = no session, never a fall-back to a cookie. `resolveAppUser` is now exported. Cookie behaviour is unchanged when there is no header.
- `middleware.ts` + `lib/api/protected-routes.ts`: for the protected API prefixes, an `Authorization` header is verified and run through the same `resolveEdgeSession` + `apiRoleAllowed`; invalid header = 401. `/api/staff` added to the protected prefixes (staff roles). `/api/upload` and `/api/cms/revalidate` need no code change: their `auth()` + `can()` checks and rate limits now see the bearer user.
- `app/api/staff/fetch-article/route.ts` (new): staff + `article.create`, 20/min per user, `{url}` -> `{title, deck, text, paragraphs, images, canonicalUrl, method}`, `Cache-Control: private, no-store`, nothing stored.
- `lib/ssrf-guard.ts` (new, port of the PC's `net-guard.cjs`): https only, port 443 only, no URL credentials, every resolved address checked (IPv4 private/loopback/link-local/metadata/CGNAT/reserved, IPv6 incl. mapped/compatible/NAT64/6to4), connection pinned to the validated IP (no rebinding), redirects re-validated (max 4), 3 MB and 12 s limits, html/text only.
- `lib/staff-article-extract.ts` (new): the PC's boilerplate/address filters copied unchanged + its no-DOM extraction path (og tags, JSON-LD, `<article>`/`<p>`, images). The PC's scored-block DOM extractor is not ported (needs a DOM); expect somewhat weaker extraction on odd sites, and no browser-rendered sites (the PC's per-site adapters are not ported).
- Tests: `lib/test/ssrf-guard.test.ts` (57), `lib/test/bearer-auth.test.ts` (16). Run: `npx vitest run lib/test/ssrf-guard.test.ts lib/test/bearer-auth.test.ts` -> pass; full suite 1319 pass, 2 fail in `zone-generation.test.ts` (archive data test, unrelated to this change). `tsc --noEmit` and eslint clean on the touched files. `next build` was NOT run (needs the production env and database).
- Not covered by a test: a real bearer round trip against Supabase (no network in tests). Test it on a preview or after deploy (steps below).

## Go-live steps (the owner)
1. In `C:\Users\User\esbpowerline`: `git switch phone-bearer-api`, review `git show 09025e1cf --stat`, run `npx vitest run lib/test/ssrf-guard.test.ts lib/test/bearer-auth.test.ts` and `npm run build`.
2. Merge into the release branch the usual way (`authenticating`, then `git push origin authenticating:main`). Pushing `main` deploys production. No env var changes are needed (the code uses the existing `NEXT_PUBLIC_SUPABASE_*` values).
3. Check with a real staff token (phone: Settings > Site account shows each feature "works"). By hand: `curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{}" https://esbpowerline.com/api/cms/revalidate` must print 400 (401 = not deployed or token refused).
4. In the phone, Settings re-probes on open; the Publish screen enables "Upload the chosen picture". Within 10 minutes any cached "Planned" result is re-checked.
Rollback: revert the commit; the phone falls back to "Planned" by itself.

## Exports the UI must wire (lead)
- `src/home/useStatus.ts`: `Status.connection` (`'connected' | 'expired' | 'offline' | 'not-connected' | 'checking'`), `CONNECTION_LABEL` (StatusBar already uses it).
- Published tab (`src/sync/published.ts`): `usePublished(active: boolean)` -> `{ status: 'idle'|'loading'|'ready'|'error', items: PublishedItem[], error, offline, reload(), open(id) }`. `open(id)` resolves to `{ ok:true, draft, liveUrl, imageUrl, imageCredit, status } | { ok:false, error }`; the caller does `useDrafts().upsert(draft)` and opens it in Publish (the draft is already linked to the site article, so Publish says Update and keeps the picture link and credit). Remove `planned: true` from the Published tab in `Desk.tsx`.
- `src/fetchArticle.ts`: `fetchArticle(url)` now returns `title` and `images` too; `fetchConnected()` says whether it is live (no network).
- Wire stays Planned.

## Draft cloud sync: design only (no table exists, none created)
Goal: phone and PC share unfinished stories. Proposed (needs an owner-approved migration in the site repo, like the PC's `outreach_*` tables): table `studio_drafts(id text pk, owner uuid default auth.uid(), device text, data jsonb, updated_at timestamptz, deleted bool)`, RLS `owner = auth.uid()` for select/insert/update (staff only), no delete (soft flag). Sync like the PC's `cloudSync.ts`: PostgREST with the staff token, pull since `updated_at - 10 min`, last writer wins per draft by `updated_at`, never delete locally on a missing row, push 4 s after a change. Draft `data` = the `Draft` fields only (no secrets, no tokens). Until then drafts stay on the phone, and the Published list is the way to move a LIVE or site-saved story onto the phone.

## Known limits
- Facebook Graph from the WebView: CORS with the Bearer header unverified.
- The 4 MB upload cap is Vercel's body limit; the phone does not resize pictures yet.
- Revalidate and upload probes send an empty request that the routes reject with 400 after auth; they count toward the per-user rate limits (20 and 30 a minute), which is negligible.

## Desktop change needed: profiles has no `status` column (2026-11-06)

`src/pc/editorial/siteApi.ts` (vendored from the desktop app) signs in, then asks
`profiles?select=role,status,full_name`. The site's `public.profiles` table has no `status` column
(id, full_name, role, avatar_url, created_at, updated_at), so that request fails every time and the session
falls back to the role and name in the auth metadata; the Suspended/Pending checks never run.
The site's own `lib/auth.ts` retries without `status`. **Fix in the desktop repo:** do the same retry
(`select=role,full_name` when the first request fails), then re-sync. Until then the phone corrects the
session's role and name from the profile row in `src/mobile/shell/avatar.tsx` (`syncSessionFromProfile`).

Also on 2026-11-06 (Supabase, applied): signed-in users may now update only `full_name`, `avatar_url` and
`updated_at` on their own `profiles` row (they could previously change `role`); the anon key can update nothing.
