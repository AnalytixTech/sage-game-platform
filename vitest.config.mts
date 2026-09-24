import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve @sagegames/* to their src via the root tsconfig paths.
  resolve: { tsconfigPaths: true },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'games/*/test/**/*.test.ts', 'services/*/test/**/*.test.ts'],
    testTimeout: 20000,
  },
});
