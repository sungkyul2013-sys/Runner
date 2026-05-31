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
  },
});
