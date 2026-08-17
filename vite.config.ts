import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

/**
 * Identifica de forma única o build servido. Muda a cada publicação
 * (hash do commit + timestamp), então o popup de atualização aparece
 * automaticamente para quem já tinha uma versão anterior do jogo
 * aberta/instalada — mesmo sem bump manual de versão.
 */
function buildVersion(): string {
  let hash = 'nogit';
  try {
    hash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    /* sem repositório git — usa apenas o timestamp */
  }
  return `${hash}-${Date.now().toString(36)}`;
}

export default defineConfig({
  plugins: [react()],
  // base relativa: permite hospedar em subpasta (ex.: GitHub Pages em /nome-do-repo/)
  base: './',
  server: { port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion()),
  },
});
