import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.centralpos.app',
  appName: 'UniPOS',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
}

export default config
