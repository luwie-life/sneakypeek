import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // index.html interpolates %VITE_MARKETING_URL% for canonical/OG tags. If
  // it is unset, Vite leaves the literal placeholder in an href and the
  // production build fails with "URI malformed". Default to the public
  // marketing origin (the same one robots.txt/sitemap.xml already use) so a
  // clean checkout always builds; set VITE_MARKETING_URL to override.
  const env = loadEnv(mode, process.cwd(), '')
  if (!env.VITE_MARKETING_URL) process.env.VITE_MARKETING_URL = 'https://sneakypeek.com'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  }
})
