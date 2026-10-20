// The 404 monitor: view the missing URLs visitors hit, clear them, or turn one
// into a redirect in a single step.

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { logActivity } from '../lib/activity.ts';
import { requireCap } from '../lib/auth.ts';
import { badRequest, notFound, parse } from '../lib/http.ts';
import { pageArgs, paged, pagingSchema } from '../lib/paging.ts';
import { normalisePath } from './redirects.ts';

export const monitor404Router = Router();
monitor404Router.use(requireCap('redirects.manage'));

monitor404Router.get('/', async (req, res) => {
  const query = parse(pagingSchema.extend({ resolved: z.enum(['0', '1']).optional() }), req.query);
  const where = query.resolved ? { resolved: query.resolved === '1' } : {};
  const [items, total] = await Promise.all([
    db.notFoundLog.findMany({ where, orderBy: { lastHitAt: 'desc' }, ...pageArgs(query) }),
    db.notFoundLog.count({ where }),
  ]);
  res.json(paged(items, total, query));
});

// Delete one logged 404, or clear them all / only the resolved ones.
monitor404Router.delete('/:id', async (req, res) => {
  await db.notFoundLog.delete({ where: { id: String(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

monitor404Router.post('/clear', async (req, res) => {
  const { only } = parse(z.object({ only: z.enum(['all', 'resolved']).default('all') }), req.body);
  const { count } = await db.notFoundLog.deleteMany({ where: only === 'resolved' ? { resolved: true } : {} });
  logActivity(req, 'delete', '404', `Cleared ${count} logged 404${count === 1 ? '' : 's'}`);
  res.json({ ok: true, count });
});

// Turn a logged 404 into a redirect and mark it resolved.
monitor404Router.post('/:id/redirect', async (req, res) => {
  const log = await db.notFoundLog.findUnique({ where: { id: String(req.params.id) } });
  if (!log) throw notFound('404 entry');
  const { toPath } = parse(
    z.object({ toPath: z.string().trim().min(1, 'Enter where it should go.').max(1000).refine((p) => p.startsWith('/') || /^https?:\/\//i.test(p), 'Use a site path like /new-page or a full https:// URL.') }),
    req.body,
  );
  const fromPath = normalisePath(log.path);
  if (fromPath === '/') throw badRequest('The homepage cannot be redirected.');
  if (/^\/(api|admin|uploads|assets)(\/|$)/i.test(fromPath)) throw badRequest('That path belongs to the CMS and cannot be redirected.');

  await db.redirect.upsert({ where: { fromPath }, update: { toPath, statusCode: 301, enabled: true }, create: { fromPath, toPath } });
  await db.notFoundLog.update({ where: { id: log.id }, data: { resolved: true } });
  logActivity(req, 'create', 'redirect', `Redirected missing ${fromPath} → ${toPath} from the 404 monitor`);
  res.json({ ok: true });
});
