import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve @sagegames/* to their src via the root tsconfig paths.
  resolve: { tsconfigPaths: true },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'games/*/test/**/*.test.ts', 'services/*/test/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    // Generous: PGlite and property tests share CPU when files run in parallel.
    testTimeout: 60000,
  },
});
