import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.esbpowerline.studio.phone',
  appName: 'ESB Studio',
  webDir: 'dist',
  plugins: { CapacitorHttp: { enabled: true } } // fetch() goes through Android's native HTTP: no browser CORS blocks for the site, Gemini and Facebook
};

export default config;
