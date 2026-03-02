import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/global-setup.mjs'],
    testTimeout: 15000,
    hookTimeout: 60000,
    pool: 'forks',
    forks: { singleFork: true }
  }
});
