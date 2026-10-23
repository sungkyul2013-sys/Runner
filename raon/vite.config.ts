import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias:
      mode === 'demo'
        ? { '@transport': fileURLToPath(new URL('./demo/transport.ts', import.meta.url)) }
        : { '@transport': fileURLToPath(new URL('./src/lib/transport.ts', import.meta.url)) },
  },
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
}));
