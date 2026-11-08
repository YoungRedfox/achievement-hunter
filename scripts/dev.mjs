import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { buildMain } from './build-main.mjs';

await buildMain(true);
const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];

const env = { ...process.env, VITE_DEV_SERVER_URL: url };
// --demo: dane przykładowe zamiast Steam, do oglądania interfejsu bez klucza
if (process.argv.includes('--demo')) env.AH_DEMO = '1';

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
