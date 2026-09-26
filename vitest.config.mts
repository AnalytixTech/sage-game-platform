import { defineConfig } from 'vitest/config';
import { parse } from 'yaml';

export default defineConfig({
  // Resolve @sagegames/* to their src via the root tsconfig paths.
  resolve: { tsconfigPaths: true },
  plugins: [
    // Same as the portal's build: `import spec from '…/openapi.yaml'` gives the parsed object.
    {
      name: 'yaml-as-json',
      transform(code, id) {
        if (!id.endsWith('.yaml') && !id.endsWith('.yml')) return null;
        return { code: `export default ${JSON.stringify(parse(code))};`, map: null };
      },
    },
  ],
  test: {
    include: ['packages/*/test/**/*.test.ts', 'games/*/test/**/*.test.ts', 'services/*/test/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    // Generous: PGlite and property tests share CPU when files run in parallel.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
