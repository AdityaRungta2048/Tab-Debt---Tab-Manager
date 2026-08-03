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
    // Vite's modulepreload polyfill injects a real fetch() to warm <link modulepreload>.
    // Chrome supports modulepreload natively, so in an extension it is both dead weight
    // and a violation of the no-network guarantee — scripts/check-no-network.mjs catches
    // it if this is ever turned back on. See PRIVACY.md.
    modulePreload: { polyfill: false },
    // Budgets are enforced by scripts/check-bundle-size.mjs, not by warnings nobody reads.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // The dashboard is opened by URL rather than declared in the manifest, so crxjs does
      // not discover it. Without this input it simply is not built.
      input:
        mode === 'mock'
          ? { dashboard: resolve(__dirname, 'index.html') }
          : { dashboard: resolve(__dirname, 'src/pages/dashboard/index.html') },
    },
  },
  server: { port: 5173 },
}));
