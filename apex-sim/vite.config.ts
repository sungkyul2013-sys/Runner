/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// SharedArrayBuffer (physics triple buffer, WASM pthreads) requires cross-origin isolation (KICKOFF A3).
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  root: 'web',
  base: './',
  publicDir: 'public',
  // web/ is the Vite root; data/ and core/tests/golden/ live next to it.
  server: { host: true, port: 5173, headers: crossOriginIsolation, fs: { allow: [projectRoot] } },
  preview: { host: true, port: 4173, headers: crossOriginIsolation },
  worker: { format: 'es' },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    root: '.',
    include: ['web/src/**/*.test.ts'],
  },
});
