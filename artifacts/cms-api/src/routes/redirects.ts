import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { logActivity } from '../lib/activity.ts';
import { requireCap } from '../lib/auth.ts';
import { badRequest, notFound, parse } from '../lib/http.ts';

export const redirectsRouter = Router();
redirectsRouter.use(requireCap('redirects.manage'));

// Paths the CMS itself owns can never be redirected away.
const PROTECTED = /^\/(api|admin|uploads|assets)(\/|$)/i;

export function normalisePath(path: string) {
  const [pathname, query] = path.trim().split('?');
  const clean = (pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/').toLowerCase();
  return query ? `${clean}?${query}` : clean;
}

const fromSchema = z
  .string()
  .trim()
  .min(1, 'Enter the old path.')
  .max(500)
  .refine((path) => path.startsWith('/'), 'Start with /, for example /old-page.')
  .transform(normalisePath)
  .refine((path) => path !== '/', 'The homepage cannot be redirected.')
  .refine((path) => !PROTECTED.test(path), 'That path belongs to the CMS and cannot be redirected.');

const toSchema = z
  .string()
  .trim()
  .min(1, 'Enter where it should go.')
  .max(1000)
  .refine((path) => path.startsWith('/') || /^https?:\/\//i.test(path), 'Use a site path like /new-page or a full https:// URL.');

const inputSchema = z.object({
  fromPath: fromSchema,
  toPath: toSchema,
  statusCode: z.union([z.literal(301), z.literal(302)]).default(301),
  enabled: z.boolean().default(true),
});

// Follow the chain from `to`; if it ever reaches `from`, the redirect would loop.
async function assertNoLoop(fromPath: string, toPath: string, excludeId?: string) {
  if (!toPath.startsWith('/')) return;
  let current = normalisePath(toPath);
  for (let hops = 0; hops < 10; hops += 1) {
    if (current === fromPath) throw badRequest('That would create a redirect loop.', { toPath: 'Leads back to itself.' });
    const next = await db.redirect.findUnique({ where: { fromPath: current } });
    if (!next || next.id === excludeId || !next.enabled || !next.toPath.startsWith('/')) return;
    current = normalisePath(next.toPath);
  }
  throw badRequest('That redirect chain is too long. Point it straight at the final page.', { toPath: 'Chain too long.' });
}

redirectsRouter.get('/', async (_req, res) => {
  res.json({ items: await db.redirect.findMany({ orderBy: { createdAt: 'desc' } }) });
});

redirectsRouter.post('/', async (req, res) => {
  const input = parse(inputSchema, req.body);
  await assertNoLoop(input.fromPath, input.toPath);
  if (await db.redirect.findUnique({ where: { fromPath: input.fromPath } })) {
    throw badRequest('A redirect from that path already exists.', { fromPath: 'Already redirected.' });
  }
  const redirect = await db.redirect.create({ data: input });
  logActivity(req, 'create', 'redirect', `Added redirect ${redirect.fromPath} → ${redirect.toPath}`, redirect.id);
  res.status(201).json({ item: redirect });
});

redirectsRouter.patch('/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await db.redirect.findUnique({ where: { id } });
  if (!existing) throw notFound('Redirect');
  const input = parse(inputSchema.partial(), req.body);
  await assertNoLoop(input.fromPath ?? existing.fromPath, input.toPath ?? existing.toPath, id);
  const redirect = await db.redirect.update({ where: { id }, data: input });
  logActivity(req, 'update', 'redirect', `Edited redirect ${redirect.fromPath} → ${redirect.toPath}`, redirect.id);
  res.json({ item: redirect });
});

redirectsRouter.delete('/:id', async (req, res) => {
  const redirect = await db.redirect.delete({ where: { id: String(req.params.id) } });
  logActivity(req, 'delete', 'redirect', `Removed redirect ${redirect.fromPath}`, redirect.id);
  res.json({ ok: true });
});
