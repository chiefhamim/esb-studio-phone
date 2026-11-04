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
    allowMixedContent: false
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
      appId: 'com.esbpowerline.studio.phone'
    }
  }
};

export default config;
