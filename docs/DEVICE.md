# Target device: Samsung Galaxy S25 Ultra

Written 2026-11-03 from what is known of the phone; **everything marked (test) must be confirmed on the owner's phone before it is relied on.**

## What the phone offers, and how this app uses it
| Phone strength | Use in ESB Studio Phone | Web or native? |
|---|---|---|
| Big 6.9" QHD+ AMOLED, 120 Hz, about 412 dp wide | Phone-first screens with a wide editing view; animation and scrolling designed for 120 Hz (transforms only, no layout thrash) | Web (CSS) |
| Landscape and Samsung DeX / multi-window | Two-pane layout (Edit + live preview, banner + story) when the window is wide; the app must be resizable | Web + Android manifest |
| Snapdragon 8 Elite (fast CPU, GPU, NPU), 12 GB RAM (test) | On-device AI where it beats the cloud: offline speech-to-text for Bangla/English dictation, background removal and face finding for banners, text clean-up. Cloud AI (Gemini, Claude) stays the default for translation | Native plugin (LiteRT / MediaPipe Tasks / whisper.cpp) |
| 200 MP camera | Shoot or pick a photo, shrink it to a sensible size (long edge about 2,560 px) before banners and upload; keep the photo credit; strip GPS from EXIF by default | Web canvas + native for very large files |
| S Pen | Pressure/hover through pointer events to mark up a photo (circle, arrow, blur a face) before it goes in the banner; the pen's handwriting-to-text works in ordinary text fields (test the rich editor: contenteditable may not take it) | Web (PointerEvents) |
| Voice and Bangla keyboard | "Speak the story": dictate into the body; send audio to Gemini for a transcript with word timings (the desktop engine already does this) | Web + native mic |
| Fingerprint / face unlock | AI keys, Facebook Page token and the site session sit in the Android Keystore; opening or publishing asks for biometrics (the phone's version of the desktop "Approve" gate) | Native plugin |
| 5G, Quick Share, share sheet | Share a link INTO the app (share target) and share the banner OUT to WhatsApp, Facebook, Quick Share | Native plugin |
| Background work | Uploads and publishing continue if the screen turns off (WorkManager); drafts saved on every edit so a killed app loses nothing | Native plugin + IndexedDB |

Not assumed: the S25 Ultra's S Pen has no Bluetooth buttons (test), and no feature here depends on them.

## Consequence for the build order
The strengths that matter most (Keystore + biometrics, share target, background upload, on-device AI) are **native**, so the app is wrapped with **Capacitor from the first milestone**, not later. The UI stays web (React) and is tested on the real phone over USB debugging (Chrome `chrome://inspect`).

1. **M0: toolchain + hello APK on the S25 Ultra.** JDK 21 and the Android SDK command-line tools on the PC (no Android Studio needed), USB debugging on the phone, install the APK, open the shell.
2. **M1: Editorial.** Link in (typed, pasted or shared), translate, edit, autosave, publish. Needs the article-fetch endpoint on esbpowerline.com.
3. **M2: Graphics.** Banner from the story, S Pen markup, share to WhatsApp / save to gallery.
4. **M3: native power.** Biometric-sealed keys, background publish, voice dictation and transcript, on-device background removal.

## Performance budgets (written into tests as they are built)
Tap to visual response under 100 ms; scrolling at the display's full rate on a 5,000-word story; cold start to usable under 2 s; photo shrink under 1 s for a 200 MP file (test); memory under 400 MB.
