import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { parse } from 'yaml';

/** `import spec from '…/openapi.yaml'` gives the parsed object (the browser gets JSON, no YAML parser). */
function yamlAsJson(): Plugin {
  return {
    name: 'yaml-as-json',
    transform(code, id) {
      if (!id.endsWith('.yaml') && !id.endsWith('.yml')) return null;
      return { code: `export default ${JSON.stringify(parse(code))};`, map: null };
    },
  };
}

// Served by the API at /portal. In development, API calls are proxied to a local API on :4000.
// The SDK packages resolve to their sources (tsconfig paths), like the playground, so the Theme
// Studio always previews the current code. The docs pages import the Markdown in /docs at build time.
export default defineConfig({
  base: '/portal/',
  plugins: [react(), yamlAsJson()],
  resolve: { tsconfigPaths: true },
  server: {
    port: 5173,
    proxy: { '/portal/api': 'http://localhost:4000', '/v2': 'http://localhost:4000' },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
