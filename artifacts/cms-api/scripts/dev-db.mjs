// Local development database: a private MySQL 8 server on port 3307, bound
// to localhost only. It never touches any MySQL service already installed.
//
// Its data lives outside the repo (%LOCALAPPDATA%\veyra-cms\mysql-data on
// Windows, ~/.veyra-cms/mysql-data elsewhere) because MySQL 8.4 on Windows
// cannot restart from a data folder whose path contains spaces, and this
// repo's usually does. Set MYSQL_DATA to put it somewhere else.
//
//   pnpm --filter @workspace/cms-api db:start   create on first run, then start
//   pnpm --filter @workspace/cms-api db:stop
//
// MySQL itself is looked for in MYSQL_BIN, then .tools/mysql/bin (a portable
// copy of the official zip), then the usual install folders, then PATH.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const PORT = 3307;
const USER = 'veyra';
// Local-only development password; the server only listens on 127.0.0.1.
const PASSWORD = 'veyra-dev';
const DB = 'veyra_cms';
const root = path.resolve(import.meta.dirname, '..', '..', '..');
const dataDir =
  process.env.MYSQL_DATA ??
  (process.platform === 'win32' && process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'veyra-cms', 'mysql-data')
    : path.join(os.homedir(), '.veyra-cms', 'mysql-data'));
const exe = process.platform === 'win32' ? '.exe' : '';

function findBin() {
  const installed = (base) =>
    existsSync(base)
      ? readdirSync(base)
          .filter((name) => name.startsWith('MySQL Server'))
          .sort()
          .reverse()
          .map((name) => path.join(base, name, 'bin'))
      : [];
  const candidates = [
    process.env.MYSQL_BIN,
    path.join(root, '.tools', 'mysql', 'bin'),
    ...installed('C:\\Program Files\\MySQL'),
    '/usr/sbin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ].filter(Boolean);
  for (const dir of candidates) if (existsSync(path.join(dir, `mysqld${exe}`))) return dir;
  // Fall back to PATH.
  return '';
}

const bin = findBin();
const tool = (name) => (bin ? path.join(bin, `${name}${exe}`) : name);
const basedir = bin ? path.dirname(bin) : '';
const asRoot = ['-uroot', '-h127.0.0.1', `-P${PORT}`];

function listening() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: PORT }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function waitFor(up, seconds = 30) {
  for (let i = 0; i < seconds * 4; i += 1) {
    if ((await listening()) === up) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(tool(cmd), args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function start() {
  if (await listening()) {
    console.log(`[db] already running on 127.0.0.1:${PORT}`);
    return;
  }
  const serverArgs = [...(basedir ? [`--basedir=${basedir}`] : []), `--datadir=${dataDir}`];
  if (/\s/.test(dataDir)) {
    console.error(`[db] MySQL cannot use a data folder with spaces in its path (${dataDir}). Set MYSQL_DATA to one without.`);
    process.exit(1);
  }
  if (!existsSync(path.join(dataDir, 'mysql'))) {
    console.log(`[db] creating a new MySQL data folder in ${dataDir}`);
    mkdirSync(path.dirname(dataDir), { recursive: true });
    // Root without a password is fine here: the server only listens on 127.0.0.1.
    if (run('mysqld', [...serverArgs, '--initialize-insecure', '--console'], { stdio: 'ignore' }) !== 0) {
      console.error('[db] mysqld --initialize failed');
      process.exit(1);
    }
  }
  const child = spawn(
    tool('mysqld'),
    [
      ...serverArgs,
      `--port=${PORT}`,
      '--bind-address=127.0.0.1',
      '--mysqlx=OFF',
      '--character-set-server=utf8mb4',
      '--collation-server=utf8mb4_0900_ai_ci',
    ],
    { detached: true, stdio: 'ignore', windowsHide: true },
  );
  child.unref();
  if (!(await waitFor(true))) {
    console.error(`[db] MySQL did not start. Check that port ${PORT} is free.`);
    process.exit(1);
  }
  for (let i = 0; i < 120; i += 1) {
    if (spawnSync(tool('mysqladmin'), [...asRoot, 'ping'], { stdio: 'ignore' }).status === 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  // Database and app user on first run. The user may create databases because
  // `prisma migrate dev` needs a temporary shadow database.
  const setup = [
    `CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`,
    ...['localhost', '127.0.0.1'].flatMap((host) => [
      `CREATE USER IF NOT EXISTS '${USER}'@'${host}' IDENTIFIED BY '${PASSWORD}';`,
      `GRANT ALL PRIVILEGES ON *.* TO '${USER}'@'${host}';`,
    ]),
  ].join(' ');
  if (run('mysql', [...asRoot, '-e', setup]) !== 0) process.exit(1);
  console.log(`[db] running: mysql://${USER}:***@127.0.0.1:${PORT}/${DB}`);
}

async function stop() {
  if (!(await listening())) {
    console.log('[db] not running');
    return;
  }
  run('mysqladmin', [...asRoot, 'shutdown']);
  console.log((await waitFor(false, 20)) ? '[db] stopped' : '[db] still running; stop it from Task Manager');
}

const command = process.argv[2];
if (command === 'start') await start();
else if (command === 'stop') await stop();
else {
  console.log('usage: node scripts/dev-db.mjs start|stop');
  process.exit(2);
}
