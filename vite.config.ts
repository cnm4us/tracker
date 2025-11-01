import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    react(),
    // Enable bundle visualizer when ANALYZE=1 is set
    process.env.ANALYZE ? visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
      open: true,
      template: 'treemap',
    }) : undefined as any,
  ].filter(Boolean) as any,
  server: {
    port: 3400,
    strictPort: true,
    host: true,
    allowedHosts: ['tracker-dev.bawebtech.com'],
    hmr: {
      host: 'tracker-dev.bawebtech.com',
      clientPort: 443,
      protocol: 'wss',
    },
  },
  preview: {
    port: 3400,
    host: true,
  },
}))
