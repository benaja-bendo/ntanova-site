import { defineConfig } from 'vitest/config';

// La vraie API locale, à la main (`pnpm test:api-locale`) : voir `tests/api-locale/envois.test.ts`.
export default defineConfig({
  test: { include: ['tests/api-locale/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 60_000 },
});
