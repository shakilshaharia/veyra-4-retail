// Run the whole website as one Node.js app, the way production does:
// website, /admin dashboard and API all on a single port.
//
//   pnpm build:cms                    (once, and after every change)
//   pnpm start:cms                    http://localhost:3000
//   PORT=3005 pnpm start:cms          if 3000 is taken
//
// Locally it also starts the dev database; on a server with a real
// DATABASE_URL, run `node --env-file=.env dist/index.mjs` directly.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const apiDir = path.resolve(import.meta.dirname, '..');
const siteDist = path.resolve(apiDir, '..', 'veyra-site', 'dist', 'public');
const adminDist = path.resolve(apiDir, '..', 'cms-admin', 'dist');
const node = process.execPath;

const missing = [
  [path.join(apiDir, 'dist', 'index.mjs'), 'API'],
  [path.join(siteDist, 'index.html'), 'website'],
  [path.join(adminDist, 'index.html'), 'admin'],
].filter(([file]) => !existsSync(file));
if (missing.length) {
  console.error(`[start] no build found for: ${missing.map(([, name]) => name).join(', ')}. Run \`pnpm build:cms\` first.`);
  process.exit(1);
}

const run = (args) => spawnSync(node, args, { cwd: apiDir, stdio: 'inherit' });

if (run([path.join(apiDir, 'scripts', 'dev-db.mjs'), 'start']).status !== 0) process.exit(1);
// Applies any new migrations; does nothing when the database is up to date.
const migrate = run(['--env-file-if-exists=.env', path.join(apiDir, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy']);
if (migrate.status !== 0) process.exit(1);

const port = process.env.PORT ?? '3000';
const url = `http://localhost:${port}`;
const server = spawn(node, ['--env-file-if-exists=.env', 'dist/index.mjs'], {
  cwd: apiDir,
  stdio: 'inherit',
  // Real environment variables win over .env.
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL ?? url,
    ADMIN_URL: process.env.ADMIN_URL ?? `${url}/admin`,
    CORS_ORIGINS: process.env.CORS_ORIGINS ?? '',
    SITE_DIST: siteDist,
    ADMIN_DIST: adminDist,
  },
});

console.log(`\n  Website  ${url}\n  Admin    ${url}/admin\n`);

const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
