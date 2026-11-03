# Android: build, install, release

## Build (debug)
```powershell
$env:JAVA_HOME='C:\Users\User\android-dev\jdk-21'; $env:ANDROID_HOME='C:\Users\User\android-dev\sdk'
npm run build; npx cap sync android
cd android; .\gradlew.bat assembleDebug      # android\app\build\outputs\apk\debug\app-debug.apk
.\gradlew.bat lintDebug                       # only known error: local.properties PropertyEscape (machine file, harmless)
```
Install on the phone (USB debugging on): `adb install -r app\build\outputs\apk\debug\app-debug.apk`. Inspect the WebView at `chrome://inspect`.

## Versions
`versionName` = `package.json` "version". `versionCode` = major*10000 + minor*100 + patch (minimum 1). Bump `package.json` before a release; Android refuses an install with a lower or equal code over a higher one.

## Release signing (key is never in the repo)
1. Make a key once (keep it and its passwords somewhere safe; losing it means a new app id for updates):
   `keytool -genkeypair -v -keystore esb-studio-release.jks -alias esb-studio -keyalg RSA -keysize 4096 -validity 10000`
2. Create `android/keystore.properties` (gitignored, as are `*.jks` and `*.keystore`):
   ```
   storeFile=../../esb-studio-release.jks
   storePassword=...
   keyAlias=esb-studio
   keyPassword=...
   ```
   (`storeFile` is relative to `android/`.)
3. `.\gradlew.bat assembleRelease` gives a signed `app-release.apk` (without keystore.properties it is unsigned and will not install).

## What is native (all in `android/app/src/main/java/com/esbpowerline/studio/phone/`)
| Feature | Native | JS API |
|---|---|---|
| Edge-to-edge, bar icons, window colour follow the in-app theme | styles (values, v28 cutout, v29 no scrim), `AppChromePlugin`, Capacitor SystemBars (`--safe-area-inset-*`) | `src/native/systemBars.ts` (started by `src/native/startup.ts`) |
| Share-in: text, links, images, PDFs, .txt files; Process text; shortcuts | `ShareTargetPlugin`, manifest filters, `activity-alias ProcessTextAlias`, `res/xml/shortcuts.xml` | `src/native/shareIn.ts` |
| Biometric app lock (default off) | `BiometricPlugin` (AndroidX BiometricPrompt) | `src/native/biometric.ts` |
| Haptics | @capacitor/haptics | `src/native/haptics.ts` |
| Network status | @capacitor/network | `src/native/network.ts` |
| Keyboard | `windowSoftInputMode=adjustResize` plus SystemBars pads the page by the keyboard height; Android has no accessory bar | none needed |

## Security notes
- Cleartext blocked: `usesCleartextTraffic=false`, `network_security_config.xml` (system CAs only), `server.cleartext=false`, `allowMixedContent=false`. Android cannot restrict by host in this file; only https works, so the allowed hosts are whatever the app calls (Supabase, Vercel, Google AI, Facebook Graph).
- Backups: `allowBackup=false`, `dataExtractionRules` (Android 12+) and `fullBackupContent` exclude everything.
- Predictive back: `enableOnBackInvokedCallback=true`. The Capacitor App plugin registers the back callback, so the JS handler in `src/shell/back.ts` (`App` backButton) keeps working; test the back swipe on the phone.
- Shared files are copied from `content://` only, max 25 MB, 10 files, types image/*, application/pdf, text/plain, into `cache/shared` (older than a day are deleted). Call `clearSharedCache()` when done.
- The biometric lock gates the screen only; secrets stay in the Keystore.

## Icon
Adaptive icon from the protected avatar `public/brand/esb-avatar.png` (byte copy of the desktop file), scaled only, centred in the safe zone on a white background; themed (monochrome) layer = the avatar's white letters as a mask. Rebuild with `python android/icon-src/make_icons.py`.
