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
        // index.html  — 수 국어논술 learning app (app/)
        // story.html  — the scroll-driven brochure site (story/)
        // game.html   — the original Sunset Runner game (src/)
        main: 'index.html',
        story: 'story.html',
        game: 'game.html',
      },
    },
  },
});
