import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The Electron build is loaded from app:// in production, where service
  // workers are neither needed (assets are local) nor supported. Keep the PWA
  // for the normal web build so existing deployments are unchanged.
  const isElectron = mode === 'electron'

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isElectron
        ? []
        : [
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
                // The POS app is served from the site root, so its service worker
                // would otherwise answer navigation requests for the admin app
                // mounted at /admin with this app's index.html.
                navigateFallbackDenylist: [/^\/admin(?:\/|$)/],
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
          ]),
    ],
    server: {
      // Electron waits for http://localhost:5173; fail instead of silently
      // moving to another port, which would leave the desktop window on a
      // blank/error page.
      strictPort: true,
      // Allow the temporary Cloudflare quick-tunnel hostname when testing the
      // camera from a phone via `npm run dev:tunnel`. Dev-only; localhost/IPs are
      // always allowed, so this has no effect for normal development.
      allowedHosts: ['.trycloudflare.com'],
    },
    preview: {
      // Same, for `npm run preview:tunnel` (the bundled build is far more reliable
      // through a quick tunnel than the many modules a dev server streams).
      allowedHosts: ['.trycloudflare.com'],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
