import { defineConfig } from 'vitest/config';

// Des constructions entières, à la main (`pnpm test:constructions`) : voir `tests/constructions/formulaires.test.ts`.
export default defineConfig({
  test: {
    include: ['tests/constructions/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
});
