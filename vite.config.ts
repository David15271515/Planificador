import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH || '/'

  return {
    base,
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
        manifest: {
          name: 'Mi Plan',
          short_name: 'Mi Plan',
          description: 'Agenda personal y de estudio',
          theme_color: '#bfe8dc',
          background_color: '#f5fbf8',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
  }
})
