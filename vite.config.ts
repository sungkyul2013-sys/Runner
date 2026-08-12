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
      input: {
        // index.html — 수 국어논술 학원 site; game.html — the Sunset Runner game.
        main: 'index.html',
        game: 'game.html',
      },
    },
  },
});
