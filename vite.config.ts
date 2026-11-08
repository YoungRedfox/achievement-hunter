import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// CSP tylko w buildzie produkcyjnym — w dev Vite wstrzykuje skrypty inline (HMR)
const csp = [
  "default-src 'self'",
  "img-src 'self' https: data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "script-src 'self'",
  "connect-src 'self'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
});

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5183, strictPort: true },
});
