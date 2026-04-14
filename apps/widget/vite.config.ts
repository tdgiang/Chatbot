import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJs from 'vite-plugin-css-injected-by-js';

export default defineConfig({
  plugins: [
    react(),
    cssInjectedByJs(), // inline CSS vào JS — single file output
  ],
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'ChatbotWidget',
      fileName: () => 'chatbot.js',
      formats: ['iife'], // immediately invoked — chạy ngay khi load
    },
    rollupOptions: {
      // Bundle tất cả, không external React để widget self-contained
      external: [],
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: 'esbuild',
    target: 'es2018',
    outDir: '../../apps/api/public', // serve trực tiếp từ API
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
