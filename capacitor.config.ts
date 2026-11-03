import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.esbpowerline.studio.phone',
  appName: 'ESB Studio',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false
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
      autoUpdate: 'atBackground',
      appReadyTimeout: 10000,
      responseTimeout: 20,
      version: '0.0.0',
      appId: 'com.esbpowerline.studio.phone'
    }
  }
};

export default config;
