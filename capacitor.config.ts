import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.esbpowerline.studio.phone',
  appName: 'ESB Studio',
  webDir: 'dist',
  // The WebView page is served from https://localhost; nothing is loaded over plain http.
  server: { androidScheme: 'https', cleartext: false },
  android: { allowMixedContent: false },
  plugins: {
    // fetch() goes through the native HTTP stack: no browser CORS blocks for the site, Gemini and Facebook.
    // Cleartext (http://) is refused natively by android/app/src/main/res/xml/network_security_config.xml.
    CapacitorHttp: { enabled: true },
    // Edge-to-edge: the app draws under the bars. 'css' publishes --safe-area-inset-* to the page.
    // Do not set Keyboard.resizeOnFullScreen: SystemBars already pads the page by the keyboard height.
    SystemBars: { insetsHandling: 'css' },
    CapacitorUpdater: {
      autoUpdate: 'off',
      appReadyTimeout: 10000,
      responseTimeout: 20
    }
  }
};

export default config;
