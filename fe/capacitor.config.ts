import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'icu.documind.app',
  appName: 'DocuMind',
  webDir: 'mobile-shell',
  server: {
    url: 'https://documind.icu',
    cleartext: false,
    allowNavigation: ['documind.icu', '*.documind.icu'],
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },
};

export default config
