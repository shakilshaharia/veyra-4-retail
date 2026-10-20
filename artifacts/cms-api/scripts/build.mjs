// Production build: generates the Prisma client, then bundles the API into a
// single dist/index.mjs.
//
// The workspace content package and the generated Prisma client are TypeScript
// source, so they are bundled in. Every npm dependency stays external and is
// loaded from node_modules at runtime (sharp and Prisma ship native/wasm parts
// that must not be bundled).
//
//   pnpm --filter @workspace/cms-api build
//   pnpm --filter @workspace/cms-api start      (from artifacts/cms-api)

import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const generate = spawnSync(process.execPath, [path.join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'generate'], {
  cwd: root,
  stdio: 'inherit',
  // Generating never connects, but the config asks for the URL.
  env: { DATABASE_URL: 'mysql://build@localhost/build', ...process.env },
});
if (generate.status !== 0) process.exit(generate.status ?? 1);

await rm(path.join(root, 'dist'), { recursive: true, force: true });

const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@workspace/'));

const result = await build({
  entryPoints: [path.join(root, 'src', 'index.ts')],
  outfile: path.join(root, 'dist', 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: [...external, ...external.map((name) => `${name}/*`)],
  // Some bundled code still calls require() for Node built-ins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs).reduce((sum, output) => sum + output.bytes, 0);
console.log(`[build] dist/index.mjs ready (${Math.round(bytes / 1024)} KB with source map)`);
