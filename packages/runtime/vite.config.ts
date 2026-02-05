import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BookAdventureRuntime',
      formats: ['iife'],
      fileName: () => 'runtime.iife.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
});
