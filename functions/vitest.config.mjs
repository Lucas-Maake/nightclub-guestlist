import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  test: {
    include: ['tests/**/*.test.mjs'],
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/global-setup.mjs'],
    testTimeout: 15000,
    hookTimeout: 60000,
    pool: 'forks',
    maxWorkers: 1,
    isolate: false
  }
});
