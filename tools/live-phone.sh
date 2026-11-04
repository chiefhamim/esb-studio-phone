#!/bin/bash
# Live view in the REAL app (com.esbpowerline.studio.phone) over Wi-Fi debugging. Built as the debug variant with -PsameId:
# the real app id, the same debug signing key as the installed APK (updates in place, logins in the Keystore keep working),
# cleartext only for the PC's Vite server through adb reverse. Usage: tools/live-phone.sh <ip:port>
set -e
P=${1:?phone ip:port from Wireless debugging}
cd "$(dirname "$0")/.."
A=/c/Users/hamim/android-dev/sdk/platform-tools/adb.exe
export JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot' ANDROID_HOME='C:\Users\hamim\android-dev\sdk'
CAP_LIVE=1 npx cap sync android >/dev/null
(cd android && ./gradlew.bat assembleDebug -q -PsameId -PbuildStamp=$(( ($(date +%s) - 1767225600) / 60 )) >/dev/null)
$A -s $P install --user 0 -r android/app/build/outputs/apk/debug/app-debug.apk | tail -1
$A -s $P reverse tcp:5173 tcp:5173 >/dev/null
$A -s $P shell am start --user 0 -n com.esbpowerline.studio.phone/.MainActivity >/dev/null
git checkout -- android/app/capacitor.build.gradle android/capacitor.settings.gradle 2>/dev/null || true
echo "live in ESB Studio"
