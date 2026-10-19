import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.centralpos.app',
  appName: 'UniPOS',
  webDir: 'dist',
  server: {
    // The WebView origin must stay a SECURE context (https://localhost), or the
    // camera's getUserMedia is blocked exactly like a plain http:// site.
    // Capacitor already defaults to https — pinned here so a future edit can't
    // silently drop the app (and its camera) into an insecure origin.
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
}

export default config
