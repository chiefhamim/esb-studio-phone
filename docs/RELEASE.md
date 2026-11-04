# Shipping an update (no USB, no GitHub, no Capgo)

Updates are hosted on Cloudflare (`update-host/`, Workers static assets) at `https://esb-studio-updates.hamim2964.workers.dev`.
The app reads `latest.json` on launch and on resume, and offers "Update now".

- **Everyday change (UI / logic):** `node tools/release.mjs --message "what changed"`. It builds, zips `dist/`, writes `latest.json` with the
  sha256 and deploys. The phone downloads the bundle, checks the checksum and restarts into it. Bundle version = `<package version>.<yyMMddHHmm>`.
- **Native change (permission / plugin / Gradle):** build and sign the APK as usual, then
  `node tools/release.mjs --apk --native --message "..."`. Installs older than the package version get the APK (Android shows its Install prompt);
  the APK must be signed with `~/.android/debug.keystore` or Android refuses the upgrade.
- Needs `npx wrangler login` once on the machine. Rollback: the plugin reverts on its own if the new bundle never calls `notifyAppReady`.
