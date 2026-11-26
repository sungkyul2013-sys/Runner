import { defineConfig } from 'vite';
export default defineConfig({ base: './', root: __dirname, server: { host: true, port: 5174 }, build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 0 } });
