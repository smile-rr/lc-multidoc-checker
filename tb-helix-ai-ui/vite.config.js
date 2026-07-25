import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TB Helix AI UI — the platform app. Runs on 5174 to stay clear of the legacy
// v3 examination UI on 5173. `/api` proxies to lc-checker-v2-svc so a module can
// swap its mock adapter for the real service without touching any call site.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@platform': fileURLToPath(new URL('./src/platform', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:9082', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('codemirror') || id.includes('@lezer')) return 'editor'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('react-router')) return 'router'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react'
        },
      },
    },
  },
})
