# One command: boot the virtual S25 Ultra (if not running), start the Vite dev server, point the dev app at it, open it.
# Run:  powershell -ExecutionPolicy Bypass -File tools\emulator-dev.ps1     (add -Rebuild after native/plugin changes)
param([switch]$Rebuild)
$sdk = 'C:\Users\hamim\android-dev\sdk'; $adb = "$sdk\platform-tools\adb.exe"; $app = 'com.esbpowerline.studio.phone.dev'
Set-Location (Split-Path $PSScriptRoot -Parent)
$up = (& $adb devices) -match 'emulator-5554\s+device'
if (-not $up) {
  Start-Process "$sdk\emulator\emulator.exe" -ArgumentList '-avd','S25Ultra','-gpu','host','-no-snapshot-save','-no-boot-anim'
  do { Start-Sleep 4 } until ((& $adb -e shell getprop sys.boot_completed 2>$null) -match '1')
}
if ($Rebuild -or -not ((& $adb -s emulator-5554 shell pm list packages $app) -match $app)) {
  $env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot'; $env:ANDROID_HOME = $sdk; $env:CAP_LIVE = '1'
  npx cap sync android; Push-Location android; .\gradlew.bat assembleDebug -q; Pop-Location
  & $adb -s emulator-5554 install -r android\app\build\outputs\apk\debug\app-debug.apk
}
& $adb -s emulator-5554 reverse tcp:5173 tcp:5173
if (-not (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process cmd -ArgumentList '/c','npm run dev -- --host 127.0.0.1 --strictPort' -WindowStyle Minimized; Start-Sleep 6
}
& $adb -s emulator-5554 shell am start -n "$app/com.esbpowerline.studio.phone.MainActivity"
