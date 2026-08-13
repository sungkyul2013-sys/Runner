import { defineConfig } from 'vite';

// Base is relative so the production bundle can be served from any sub-path.
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      // Multi-page build. Paths are resolved against the Vite root.
      input: {
        // 수 국어논술 — the Korean language-arts study app (primary entry).
        main: 'index.html',
        // NeonDash — the original 3D endless runner, kept alongside.
        runner: 'runner.html',
      },
    },
  },
});
