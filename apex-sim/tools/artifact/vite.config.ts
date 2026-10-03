// Bundles tools/artifact/garage.ts (with three.js) into one ES module for the published garage Artifact.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: process.env.APEX_ARTIFACT_OUT ?? fileURLToPath(new URL('../../dist-artifact', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    lib: { entry: fileURLToPath(new URL('./garage.ts', import.meta.url)), formats: ['es'], fileName: () => 'garage.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
