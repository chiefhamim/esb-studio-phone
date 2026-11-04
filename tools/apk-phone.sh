#!/bin/bash
# Keep it: build the real release APK (no live URL, no OTA) and install it OVER the live build on the phone, Wi-Fi debugging.
# Same signing key as before, so the update keeps every login and every story. Usage: tools/apk-phone.sh <ip:port>
set -e
P=${1:?phone ip:port from Wireless debugging}
cd "$(dirname "$0")/.."
A=/c/Users/hamim/android-dev/sdk/platform-tools/adb.exe; BT=/c/Users/hamim/android-dev/sdk/build-tools/36.0.0; O=android/app/build/outputs/apk/release
export JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot' ANDROID_HOME='C:\Users\hamim\android-dev\sdk'
VITE_NO_OTA=1 npm run build >/dev/null
npx cap sync android >/dev/null
grep -q '"url"' android/app/src/main/assets/capacitor.config.json && { echo "live url still in config, stopping"; exit 1; }
(cd android && ./gradlew.bat assembleRelease -q -PbuildStamp=$(( ($(date +%s) - 1767225600) / 60 )) >/dev/null)
"$BT/zipalign.exe" -f 4 $O/app-release-unsigned.apk $O/aligned.apk
"$BT/apksigner.bat" sign --ks "$USERPROFILE\.android\debug.keystore" --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --out $O/ESB-Studio.apk $O/aligned.apk
$A -s $P install --user 0 -r $O/ESB-Studio.apk | tail -1
$A -s $P reverse --remove tcp:5173 2>/dev/null || true
$A -s $P shell am start --user 0 -n com.esbpowerline.studio.phone/.MainActivity >/dev/null
git checkout -- android/app/capacitor.build.gradle android/capacitor.settings.gradle 2>/dev/null || true
echo "APK installed: ESB Studio is a normal app again"
