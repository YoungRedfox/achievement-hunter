import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

// Proces główny i preload pakujemy esbuildem do CJS — sandboxowany preload nie zna ESM
export async function buildMain(dev = false) {
  const common = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron'],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    logLevel: 'warning',
  };
  await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.js' });
  await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.js' });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildMain(false);
}
