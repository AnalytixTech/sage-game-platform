import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served by the API at /portal. In development, API calls are proxied to a local API on :4000.
export default defineConfig({
  base: '/portal/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/portal/api': 'http://localhost:4000', '/v2': 'http://localhost:4000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
