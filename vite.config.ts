import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'node:path';
import manifest from './src/manifest.config';

export default defineConfig(({ mode }) => ({
  plugins: [
    preact(),
    // The mock-backed dev server (`vite dev`) must NOT run the crx plugin: the whole
    // point of the harness is that the dashboard boots in a plain tab with no extension.
    ...(mode === 'mock' ? [] : [crx({ manifest })]),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  define: {
    __MOCK__: JSON.stringify(mode === 'mock'),
  },
  build: {
    target: 'esnext',
    // Budgets are enforced by scripts/check-bundle-size.mjs, not by warnings nobody reads.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input:
        mode === 'mock'
          ? { dashboard: resolve(__dirname, 'index.html') }
          : undefined,
    },
  },
  server: { port: 5173 },
}));
