# ESB Studio Phone: Android implementation (PC clone, branch `pc-clone`)

The phone app is a functional clone of the PC app ESB AI Studio for **Editorial** and **Graphics**: the same engine,
stores, editor, checks and output, vendored verbatim from the PC repo, with an Android-first layout built around them.

## Architecture

```
src/pc/**            PC code, vendored VERBATIM (never edited). Engine, stores, editor, checks, export, tokens, fonts.
src/platform/**      Typed platform layer + window.esb shim + storage router + migrations (phone behaviour lives here).
src/mobile/**        Android UI: shell (grid, nav, sheets, dialogs), Home, Editorial, Graphics, Settings.
src/native/**        Capacitor bridges (share-in, system bars, biometric lock, haptics, network).
android/**           Capacitor Android project; native plugins in app/src/main/java/com/esbpowerline/studio/phone/.
tools/**             sync-pc.mjs, pc-css-scope.ts (Vite), e2e/geometry.mjs, parity/parity.mjs, shot.mjs.
```

### Boot order (`src/main.tsx` → `src/platform/boot.ts`)
1. `migrateSecrets()` — the phone's old Keystore secrets get PC-shaped copies (old ones kept).
2. `hydrateStorage()` — installs the storage router (below) and loads routed keys into memory.
3. `migrateOldDrafts()` — old phone drafts (`esb-phone-drafts-v1`, and the earlier build's `esb-drafts-v1`) are
   copied into the PC story queue. Never deleted, never duplicated, never overwrite an edited story.
4. `loadPlatform()` + `installEsbShim()` — `window.esb` for the PC code.
5. Only now the app and the PC modules are imported (they read storage at module load), then
   `startStoryGraphics()` restores the active story's banner, then the first paint.

### Vendoring (`tools/sync-pc.mjs`)
- `npm run sync:pc` copies the entry files listed in `ENTRIES` **and everything they import** (followed transitively,
  including each module's own `*.test.ts`, CSS `@import`/`url()` and `?url`/`?raw` assets) from
  `C:\Users\User\esb-banner-studio\src` into `src/pc/`, replacing the folder. `src/pc/SYNC_MANIFEST.json` records the PC
  commit and a sha256 per file. The script only reads the PC repo.
- `npm run check:pc` fails if any vendored file was edited, removed or added by hand.
- `.gitattributes`: `src/pc/** -text` keeps the files byte-exact on every checkout (no CRLF conversion).
- To update after PC changes: `npm run sync:pc`, then `npm run build && npm test && npm run test:parity`, review the
  diff of `src/pc`, commit. If the PC adds a `window.esb` call, add it to `src/platform/esbShim.ts`.
- Vendored PC tests (`src/pc/**/*.test.ts`) run in `npm test`. `src/pc` is excluded from oxlint (the PC lints it).

### PC CSS on the phone
- Global: `src/pc/fonts.css`, `src/pc/styles/tokens.css` (the "Quiet Studio" tokens, light/dark via `html[data-theme]`).
- Scoped: every other vendored stylesheet is wrapped in `@scope (.pc-host)` by `tools/pc-css-scope.ts` (a Vite
  transform). PC components are mounted inside `<PcHost>` (`src/mobile/PcHost.tsx`); the PC's desktop page rules never
  touch the phone shell. `src/mobile/pcHost.css` only raises hit areas and input text size inside `.pc-touch`.

### Platform layer (`src/platform`)
| Need | Android (`android.ts`) | Browser (`web.ts`) |
|---|---|---|
| Pick PDF / DOCX / images | `<input type=file>` → Android file chooser | same |
| Camera | `@capacitor/camera` | `<input capture>` |
| Save image / ZIP | `MediaStorePlugin.java` → Pictures/ESB Studio, Download/ESB Studio (no permission on Android 10+); on failure the UI offers Share | download |
| Share | `@capacitor/share` (files written to cache first) | Web Share or download |
| Clipboard | `navigator.clipboard` | same |
| Link / feed fetch (`fetchUrl`) | Settings > Link fetching: **site** (default) = `POST /api/staff/fetch-article` (branch `phone-bearer-api`; "not live" until deployed) or **this phone** = CapacitorHttp with the PC net-guard URL checks | dev proxy |
| Picture fetch (`fetchImageData`) | CapacitorHttp, guarded, 25 MB cap | same |
| Site upload / revalidate | `esbShim.siteUpload/siteRevalidate` → `src/sync/endpoints.ts` bearer routes; probe first, honest "Planned · site update needed" until live | same |
| Projects (`saveProject/openProject`) | IndexedDB `project:<name>` | same |

### Storage (`src/platform/storage.ts`)
The PC uses `localStorage`. On the phone `Storage.prototype` is routed:
- **Secrets** (`esb-banner-studio/site-session`, `/ai-settings`, `/facebook`) → Android Keystore
  (`@aparajita/capacitor-secure-storage` via `src/secure.ts`) + memory. Never written to disk localStorage.
- **Large** (graphics doc, autosave snapshot, editorial story, story queue, wire inbox, job log, card designs) →
  IndexedDB `esb-phone/kv` + memory, written through (150 ms debounce) and flushed on background/pagehide.
- Per-story banner projects (PC `.esb` format, photos included) → IndexedDB `graphics:<storyId>`
  (`src/mobile/library/storyGraphics.ts`), so a banner survives the app being killed.
- Everything else stays in localStorage as on the PC.
- The phone's own site code (`src/publish/site.ts`) reads/writes the same session key, so one sign-in serves both and a
  single-use refresh token is never used twice.

## Permissions
`INTERNET`, `USE_BIOMETRIC`, camera (requested by `@capacitor/camera` at first use). No storage permission: saving uses
MediaStore. Cleartext traffic blocked (`network_security_config.xml`). Backups disabled. Share-in filters: text, links,
images, PDF, text files (`ShareTargetPlugin`).

## Build and install (debug)
```powershell
$root="C:\Users\User\android-dev"; $env:JAVA_HOME="$root\jdk-21"; $env:ANDROID_HOME="$root\sdk"
$adb="$root\sdk\platform-tools\adb.exe"
npm run build; npx cap sync android; cd android; .\gradlew.bat assembleDebug
& $adb install -r app\build\outputs\apk\debug\app-debug.apk     # -r keeps the editor's data
```
Always `npm run build` before `cap sync` (sync copies `dist/`; a failed build ships the old one).

## Signed release
1. Keystore once: `keytool -genkeypair -v -keystore esb-studio-release.jks -alias esb-studio -keyalg RSA -keysize 4096 -validity 10000`
   (keep it and its passwords safe; losing it means a new app id for updates).
2. `android/keystore.properties` (gitignored, as are `*.jks`/`*.keystore`): `storeFile=../../esb-studio-release.jks`,
   `storePassword=…`, `keyAlias=esb-studio`, `keyPassword=…` (`storeFile` relative to `android/`).
3. Bump `package.json` version (versionCode = major*10000 + minor*100 + patch), `npm run build`, `npx cap sync android`,
   `cd android; .\gradlew.bat assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.

## Tests
| Command | What |
|---|---|
| `npm run build` | `tsc -b` strict + Vite build |
| `npm run lint` | oxlint (vendored `src/pc` excluded) |
| `npm test` | vitest: PC unit tests (vendored), platform, storage router, migrations, shell, screens |
| `npm run check:pc` | vendored files byte-identical to the manifest |
| `npm run test:parity` | PC renderer (PC repo, read-only dev server :5299) vs phone renderer and phone export path (:5183), 9 formats × 10 categories, pixel-identical |
| `npm run test:geometry` | preview build on :4173; 9 viewport sizes × light/dark × 130 % text: overflow, clipping, 48 px targets, 8 px spacing, 16 px inputs, grid margins, safe areas, dialogs on screen, nav present |

Parity note: GPU canvas rasterisation is not bit-stable between runs (a few anti-aliased edge pixels vary run to run,
on the PC itself too), so the parity test runs the canvas in software mode; a PC-against-itself control run
(`SELF=1`) proves the comparison is deterministic.
