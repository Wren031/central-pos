import { fileURLToPath } from 'node:url'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Opt-in HTTPS for the DEV server, so a phone/tablet on the LAN can open a
  // SECURE origin (browsers block camera getUserMedia on plain http:// LAN
  // URLs). Enable with VITE_DEV_HTTPS=1 in .env.local, then open
  // https://<your-pc-ip>:5173 and accept the self-signed cert once.
  //
  // Gated to `development` mode on purpose: the plugin also sets
  // `preview.https`, and `vite preview` (production mode) must stay on
  // http://localhost so the Playwright suite keeps working unchanged.
  const devHttps = mode === 'development' && env.VITE_DEV_HTTPS === '1'

  return {
    plugins: [
      react(),
      ...(devHttps ? [basicSsl()] : []),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'UniPOS',
          short_name: 'UniPOS',
          description: 'Offline-first point of sale (demo)',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              // Google Fonts stylesheets — cache-first so the POS shell renders offline.
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'font-files',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
    // Expose the dev server on the LAN only when HTTPS is enabled (so the phone
    // can reach it over a secure origin).
    ...(devHttps ? { server: { host: true } } : {}),
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
