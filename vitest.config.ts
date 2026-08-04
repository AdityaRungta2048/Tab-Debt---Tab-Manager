import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  define: { __MOCK__: JSON.stringify(true) },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts', 'src/core/**/index.ts'],
      thresholds: {
        // The brief's gate: core/ at or above 90%.
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
      reporter: ['text-summary'],
    },
  },
});
