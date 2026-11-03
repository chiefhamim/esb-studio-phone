// Imported once from src/main.tsx: starts the native chrome sync and the (default-off) app lock. No-ops in a browser.
import { startSystemBars } from './systemBars'
import { startAppLock } from './biometric'

startSystemBars()
startAppLock()
