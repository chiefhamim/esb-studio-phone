# Plan: ESB Studio Phone

**Goal:** make news on the go. Paste or share a link, get a clean English story, check it, make the banner, publish.
**Not in scope:** Outreach (needs mail servers), the Video desk (heavy), the render queue.

## What already works over plain web requests (reused from the desktop app)
AI translation and SEO/captions (Gemini, Claude, OpenAI direct from the app with the editor's key), Supabase sign-in and
saving articles to esbpowerline.com, Facebook Page posting, Graphics banners drawn on a canvas and exported as images, PDF reading in the app.

## What has to be built or replaced
1. **Phone screens** for Editorial and Graphics (Stories, Edit, Banner, Publish). The desktop desks are three columns with a 900 px minimum.
2. **Article fetching:** a small staff-only endpoint on esbpowerline.com (the desktop app reads sources through its own process). Needs the site repo.
3. **Picture upload** with the login token in a header (the desktop app uses the site's session cookie through its main process).
4. **Secure storage** for keys and tokens (Android Keystore through a Capacitor plugin).
5. **Share target and share out:** receive a link shared from another app; share or save the banner (WhatsApp, gallery).
6. **Autosave on every edit**, because switching apps can kill the page.

## Order
1. Editorial on the phone (installable web app first): link in, translate, edit, publish. Test on the real phone.
2. Graphics banner and sharing.
3. Capacitor wrapper for an Android build (APK for the owner first, Play Store later).

## Open questions for the owner
- Android phone model and Android version (for testing).
- Article fetching through an endpoint on esbpowerline.com: confirm.
- Whether the first release may be an installable web app before the APK exists.

## Risks
Bangla typing and text correction on phone keyboards; very large camera photos (shrink before banners and upload); losing unsaved
work when the app is backgrounded.
