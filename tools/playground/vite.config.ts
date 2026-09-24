import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renders the React Native SDK in a browser through react-native-web, for visual checks.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: { 'react-native': 'react-native-web' },
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js'],
  },
  define: { __DEV__: 'true', global: 'globalThis', 'process.env.NODE_ENV': '"development"' },
  server: { port: 5199 },
});
