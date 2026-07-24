import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// LC Governance Console — Vite dev server on 5174 to avoid clashing with the
// v3 examination UI (which runs on 5173). Backend svc is added later.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: '127.0.0.1',
  },
})
