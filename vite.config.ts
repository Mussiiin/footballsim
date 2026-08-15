import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // base relativa: permite hospedar em subpasta (ex.: GitHub Pages em /nome-do-repo/)
  base: './',
  server: { port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
