import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.esbpowerline.studio.phone',
  appName: 'ESB Studio',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // CAP_LIVE=1 is the dev live-reload build only: the WebView loads the PC's Vite server through `adb reverse`.
    ...(process.env.CAP_LIVE ? { url: 'http://localhost:5173', cleartext: true } : { cleartext: false })
  },
  android: {
    allowMixedContent: false,
    // the live build only: lets the PC inspect the WebView (never in a shipped APK)
    ...(process.env.CAP_LIVE ? { webContentsDebuggingEnabled: true } : {})
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    SystemBars: {
      insetsHandling: 'css'
    },
    CapacitorUpdater: {
      // false: a bundle is applied only when the editor taps "Update now" (the dialog), never silently in the background.
      autoUpdate: false,
      appReadyTimeout: 10000,
      responseTimeout: 20,
      // Updates come only from our own signed host (src/platform/ota.ts). Empty URLs stop the plugin reporting device and
      // version statistics to Capgo's servers (plugin.capgo.app/stats, on by default) and from calling its channel and
      // update services at all.
      statsUrl: '',
      channelUrl: '',
      updateUrl: '',
      appId: 'com.esbpowerline.studio.phone'
    }
  }
};

export default config;
