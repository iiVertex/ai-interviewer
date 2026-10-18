import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // FastAPI runs on :8000 locally (see README); same-origin /api in production.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
