import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3400,
    strictPort: true,
    host: true,
    allowedHosts: ['tracker.bawebtech.com'],
    hmr: {
      host: 'tracker.bawebtech.com',
      clientPort: 443,
      protocol: 'wss',
    },
  },
  preview: {
    port: 3400,
    host: true,
  },
})
