import { defineConfig } from 'vitest/config';
import { parse } from 'yaml';

/**
 * The API suite runs once per database: SQLite and in-memory Postgres (PGlite) always; MySQL,
 * MariaDB and a real Postgres when TEST_MYSQL_URL / TEST_MARIADB_URL / TEST_POSTGRES_URL point at a
 * server (CI service containers).
 */
const API_TESTS = 'services/api/test/**/*.test.ts';
const apiProjects: { name: string; env: Record<string, string> }[] = [
  { name: 'api:sqlite', env: { SAGE_TEST_DB: 'sqlite' } },
  { name: 'api:pglite', env: { SAGE_TEST_DB: 'pglite' } },
  ...(process.env.TEST_MYSQL_URL ? [{ name: 'api:mysql', env: { SAGE_TEST_DB: 'mysql' } }] : []),
  // MariaDB speaks the MySQL protocol: same dialect, its own server.
  ...(process.env.TEST_MARIADB_URL ? [{ name: 'api:mariadb', env: { SAGE_TEST_DB: 'mysql', TEST_MYSQL_URL: process.env.TEST_MARIADB_URL } }] : []),
  ...(process.env.TEST_POSTGRES_URL ? [{ name: 'api:postgres', env: { SAGE_TEST_DB: 'postgres' } }] : []),
];

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
    // Generous: PGlite and property tests share CPU when files run in parallel.
    testTimeout: 60000,
    hookTimeout: 60000,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['packages/*/test/**/*.test.ts', 'games/*/test/**/*.test.ts', 'services/portal/test/**/*.test.ts'] },
      },
      ...apiProjects.map((p) => ({
        extends: true,
        test: { name: p.name, include: [API_TESTS], env: p.env },
      })),
    ],
  },
});
