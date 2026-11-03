# CLAUDE.md: ESB Studio Phone

Phone companion to ESB AI Studio (desktop, `chiefhamim/esb-banner-studio`). Read `docs/PLAN.md` and `docs/DEVICE.md` first. **Target device: Samsung Galaxy S25 Ultra** (design for about 412 dp wide, 120 Hz, S Pen, DeX/landscape; confirm on the real phone). The app is a Capacitor wrapper around the React UI from the start.

## Rules (the same ones as the desktop app)
- **Never invent content**: no made-up names, figures, quotes or sources. AI output is a draft until the editor reviews it.
- **Nothing goes live without the editor pressing Publish** for that story. Never post, send or publish in a test.
- **Secrets stay out of the repo and out of logs.** AI keys, the Facebook Page token and the site session live in the phone's
  secure storage (Android Keystore through Capacitor), never in plain localStorage, never in a URL.
- **"Planned" is not "working"**: a control that is not built is labelled Planned or absent. No fake success states.
- **Brand:** "ESB Power Line" (two words). Never redraw, recolour or re-encode the protected logo artwork; copy it from the desktop repo when it is needed, unchanged.
- **Phone-first UI:** one screen, one job. Touch targets at least 44 px. Respect the safe areas. Works with one hand. Bangla uses Hind Siliguri at line-height 1.6; English uses Inter.
- Reuse logic from the desktop app by copying the module and its test, then keep the copy's own tests green. Record where it came from in the file header.

## Commands
`npm run dev`, `npm run build` (tsc -b, strict: run it, `tsc --noEmit` misses errors), `npm run lint`.

## Where things go
`src/` the app. `docs/` plan and decisions. Keep the desktop repo untouched; open an issue-style note in `docs/` for anything this project needs changed there.
