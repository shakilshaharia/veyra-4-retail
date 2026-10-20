import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client.ts';
import { env } from './env.ts';

// The MariaDB driver talks to both MySQL 8 and MariaDB. It accepts the usual
// mysql:// URL; driver options go in its query string.
const adapter = new PrismaMariaDb(env.DATABASE_URL);

export const db = new PrismaClient({
  adapter,
  log: env.isProd ? ['error'] : ['warn', 'error'],
});

export type Db = typeof db;
