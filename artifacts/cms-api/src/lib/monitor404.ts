// The 404 monitor records missing URLs visitors hit, so broken links and bad
// backlinks can be found and redirected.

import { db } from '../db.ts';
import { getSetting } from './settings.ts';

// Obvious non-page requests (assets, dot-files, long junk) are ignored so the
// log stays about real, fixable pages.
const SKIP = /\.(?:ico|png|jpe?g|gif|svg|webp|avif|css|js|map|txt|xml|woff2?|ttf|mp4|webm|pdf|json)$|^\/(?:uploads|media|assets|figma|api|admin)\b|\/\./i;
const MAX_ROWS = 2000;

export async function logNotFound(path: string, meta: { userAgent?: string; referrer?: string } = {}) {
  try {
    if (!(await getSetting('seo')).monitor404) return;
    const clean = path.split('?')[0].slice(0, 500);
    if (!clean.startsWith('/') || clean.length > 300 || SKIP.test(clean)) return;

    const existing = await db.notFoundLog.findUnique({ where: { path: clean }, select: { id: true } });
    if (!existing && (await db.notFoundLog.count()) >= MAX_ROWS) return; // don't let bots flood the table
    await db.notFoundLog.upsert({
      where: { path: clean },
      update: { hits: { increment: 1 }, lastHitAt: new Date(), resolved: false, userAgent: (meta.userAgent ?? '').slice(0, 300), referrer: (meta.referrer ?? '').slice(0, 500) },
      create: { path: clean, userAgent: (meta.userAgent ?? '').slice(0, 300), referrer: (meta.referrer ?? '').slice(0, 500) },
    });
  } catch {
    // Logging a 404 must never break the 404 response itself.
  }
}
