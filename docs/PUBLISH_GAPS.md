# Publish: what esbpowerline.com cannot do for the phone yet

Written 2026-11-03 from reading the desktop app (`esb-banner-studio` `electron/site-upload.cjs`, `src/editorial/siteApi.ts`) and the site (`esbpowerline` `app/api/upload/route.ts`, `app/api/cms/revalidate/route.ts`, `utils/supabase/server.ts`).

## What works with a bearer token
Sign-in (`POST {SUPABASE}/auth/v1/token?grant_type=password`), refresh, reading `profiles`, and reading/inserting/updating `public."Article"` through Supabase REST (`/rest/v1/Article`) all take `apikey` + `Authorization: Bearer <access token>`. The desktop saves articles exactly this way, so the phone does too (`src/publish/site.ts`).

## Gap 1: picture upload (button says "Planned")
- Desktop call: `POST https://esbpowerline.com/api/upload`, multipart `file` + `folder=library`, header `Cookie: sb-<ref>-auth-token=...` (sent by Electron's main process, which can set a Cookie header).
- Why the phone cannot: the route calls `auth()` which builds a Supabase server client from `cookies()` only. It never reads `Authorization`. A WebView `fetch` cannot set `Cookie`.
- Site would need: accept `Authorization: Bearer <supabase access token>` in `/api/upload` (validate with `supabase.auth.getUser(token)`, then the same `media.upload` role check, rate limit and `uploadMediaBuffer`), or a new `/api/upload/mobile` doing so. Same 4 MB Vercel body limit applies.
- Meanwhile: the story can carry an already-hosted `https` picture link; Facebook posts upload the picture straight to Graph.

## Gap 2: cache refresh after a publish
- Desktop call: `POST https://esbpowerline.com/api/cms/revalidate` with `{ "slugs": ["<slug>"] }` and the session cookie.
- Same cause (cookie only). Site would need bearer-token acceptance on this route.
- Effect: a published story may sit behind the site's ISR window before readers see it. The screen says so; it does not claim the pages are fresh.

## To confirm on the phone (test)
- Facebook Graph calls from the WebView send `Authorization: Bearer` (preflighted). The desktop does the same from Electron; if Graph's CORS rejects it in the WebView, the call needs the native HTTP plugin.
- The author table (`src/publish/categories.ts`) is the desktop's. An account missing from it is refused with a plain message, not guessed.
