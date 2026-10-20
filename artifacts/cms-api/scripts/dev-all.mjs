// Start the whole local stack with one command:
//   database (3307) → API (4000) → website (3000) → admin (3001)
//
//   pnpm dev:cms        (from the workspace root)
//
// Ctrl+C stops the three servers; the database keeps running until
// `pnpm --filter @workspace/cms-api db:stop`.
//
// If 3000 or 3001 is taken by something else, pick other ports:
//   SITE_PORT=3002 ADMIN_PORT=3003 pnpm dev:cms

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const node = process.execPath;

const db = spawnSync(node, [path.join(import.meta.dirname, 'dev-db.mjs'), 'start'], { stdio: 'inherit' });
if (db.status !== 0) process.exit(db.status ?? 1);

const sitePort = process.env.SITE_PORT ?? '3000';
const adminPort = process.env.ADMIN_PORT ?? '3001';
const siteUrl = `http://localhost:${sitePort}`;
const adminUrl = `http://localhost:${adminPort}`;

const colors = { api: 35, site: 36, admin: 33 };
const services = [
  {
    name: 'api',
    cwd: path.join(root, 'artifacts', 'cms-api'),
    args: ['node_modules/tsx/dist/cli.mjs', 'watch', '--env-file-if-exists=.env', 'src/index.ts'],
    // Real environment variables win over .env, so these follow the chosen ports.
    env: { PUBLIC_SITE_URL: siteUrl, ADMIN_URL: `${adminUrl}/admin`, CORS_ORIGINS: `${siteUrl},${adminUrl}` },
  },
  {
    name: 'site',
    cwd: path.join(root, 'artifacts', 'veyra-site'),
    args: ['node_modules/vite/bin/vite.js', '--config', 'vite.config.ts'],
    env: { PORT: sitePort, BASE_PATH: '/' },
  },
  {
    name: 'admin',
    cwd: path.join(root, 'artifacts', 'cms-admin'),
    args: ['node_modules/vite/bin/vite.js', '--config', 'vite.config.ts', '--host', '127.0.0.1'],
    env: { PORT: adminPort, SITE_DEV_URL: siteUrl },
  },
];

const children = services.map((service) => {
  const child = spawn(node, service.args, { cwd: service.cwd, env: { ...process.env, ...service.env, FORCE_COLOR: '1' } });
  const prefix = `\x1b[${colors[service.name]}m[${service.name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => process.stdout.write(`${prefix}exited (${code ?? 'signal'})\n`));
  return child;
});

console.log(`\n  Website  ${siteUrl}\n  Admin    ${adminUrl}/admin\n  API      http://localhost:4000/api/health\n`);

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
