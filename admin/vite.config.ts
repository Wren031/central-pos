import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served under /admin by the Vercel services rewrite in ../vercel.json.
  // Vercel serves a service's static files by their original request path, so
  // the build must be emitted at dist/admin/* to make /admin/assets/* resolve.
  base: '/admin/',
  build: {
    outDir: 'dist/admin',
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
  },
})
