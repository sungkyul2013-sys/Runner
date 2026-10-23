import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  const preview = mode === 'demo';
  return {
    plugins: [react()],
    resolve: {
      alias: { '@transport': here(preview ? './demo/transport.ts' : './src/lib/transport.ts') },
    },
    build: preview
      ? {
          // 미리보기: 한 장짜리 HTML 로 묶기 위해 모든 자원을 안에 넣는다
          outDir: 'dist-demo',
          emptyOutDir: true,
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          modulePreload: false,
          chunkSizeWarningLimit: 4000,
          rollupOptions: { input: here('./demo/index.html'), output: { inlineDynamicImports: true } },
        }
      : {
          outDir: 'dist/client',
          emptyOutDir: true,
        },
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:3000' },
    },
  };
});
