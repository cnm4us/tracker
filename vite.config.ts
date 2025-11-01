import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const analyze = env.ANALYZE || process.env.ANALYZE
  const viteHost = env.VITE_HOST || 'localhost'
  const port = Number(env.PORT || 3400)
  const hmrProto = env.VITE_HMR_PROTO || (viteHost !== 'localhost' ? 'wss' : 'ws')
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT ? Number(env.VITE_HMR_CLIENT_PORT) : (hmrProto === 'wss' ? 443 : undefined)

  return ({
    plugins: [
      react(),
      // Enable bundle visualizer when ANALYZE=1 is set
      analyze ? visualizer({
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
        open: true,
        template: 'treemap',
      }) : undefined as any,
    ].filter(Boolean) as any,
    server: {
      port,
      strictPort: true,
      host: true,
      allowedHosts: [viteHost],
      hmr: {
        host: viteHost,
        protocol: hmrProto as any,
        ...(hmrClientPort ? { clientPort: hmrClientPort } : {}),
      },
    },
    preview: {
      port,
      host: true,
    },
  })
})
