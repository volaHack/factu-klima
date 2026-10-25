import { configDefaults, defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // electron/ usa node:test (node --test electron/navegacion.test.js).
    exclude: [...configDefaults.exclude, 'electron/**'],
  },
});
