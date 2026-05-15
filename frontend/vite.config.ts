import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:45001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': API_TARGET,
      '/recordings': API_TARGET,
      '/socket.io': { target: API_TARGET, ws: true },
    },
  },
});
