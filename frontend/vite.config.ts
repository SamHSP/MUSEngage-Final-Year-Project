import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'qr-scanner': fileURLToPath(new URL('./vendor/qr-scanner', import.meta.url)),
      'react-qr-code': fileURLToPath(new URL('./vendor/react-qr-code', import.meta.url)),
      'react-qr-scanner': fileURLToPath(new URL('./vendor/react-qr-scanner', import.meta.url)),
      'react-helmet-async': fileURLToPath(new URL('./src/lib/react-helmet-async.tsx', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['qr-scanner', 'react-qr-code', 'react-qr-scanner'],
  },
  build: {
    sourcemap: true,
  },
  server: {
    host: true, // 0.0.0.0 in container
    port: 3000,
    strictPort: true,
    hmr: { clientPort: 3000 },
    watch: { usePolling: true },
    allowedHosts: ['frontend', 'localhost', '127.0.0.1'],
  },
})
