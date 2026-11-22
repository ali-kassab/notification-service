import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // The demo's own backend (server/demo-server.mjs) holds the secret API key.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
