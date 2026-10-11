import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.centralpos.app',
  appName: 'Central POS',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
}

export default config
