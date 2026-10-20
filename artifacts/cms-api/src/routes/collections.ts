// The homepage's reusable blocks. One set of routes serves all five:
//   GET    /collections/:type            all items, in display order
//   POST   /collections/:type            create (appended at the end)
//   PATCH  /collections/:type/:id        edit, or toggle published
//   DELETE /collections/:type/:id
//   POST   /collections/:type/reorder    { ids: [...] } in the new order

import {
  clientLogoSchema,
  faqSchema,
  metricSchema,
  productSchema,
  testimonialSchema,
} from '@workspace/cms-content';
import { Router } from 'express';
import { z, type ZodObject, type ZodRawShape } from 'zod';
import { db } from '../db.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import { requireCap } from '../lib/auth.ts';
import { badRequest, notFound, parse } from '../lib/http.ts';

export const collectionsRouter = Router();
collectionsRouter.use(requireCap('collections.manage'));

// The Prisma delegates differ per model; this is the slice the routes use.
type Delegate = {
  findMany(args: object): Promise<Array<Record<string, unknown> & { id: string; order: number }>>;
  findUnique(args: object): Promise<(Record<string, unknown> & { id: string }) | null>;
  aggregate(args: object): Promise<{ _max: { order: number | null } }>;
  create(args: object): Promise<Record<string, unknown> & { id: string }>;
  update(args: object): Promise<Record<string, unknown> & { id: string }>;
  delete(args: object): Promise<unknown>;
};

type Collection = {
  model: Delegate;
  schema: ZodObject<ZodRawShape>;
  label: string;
  name: (item: Record<string, unknown>) => string;
  toDb?: (data: Record<string, unknown>) => Record<string, unknown>;
  check?: (data: Record<string, unknown>, id?: string) => Promise<void>;
};

// Element ids already used by the page; a product anchor must not reuse one.
const RESERVED_ANCHORS = new Set(['top', 'main-content', 'results', 'experiences', 'platform', 'stories', 'faq', 'footer']);

const collections: Record<string, Collection> = {
  metrics: {
    model: db.metric as unknown as Delegate,
    schema: metricSchema,
    label: 'statistic',
    name: (item) => `${item.value} ${item.label}`,
  },
  testimonials: {
    model: db.testimonial as unknown as Delegate,
    schema: testimonialSchema,
    label: 'testimonial',
    name: (item) => String(item.role),
  },
  faqs: {
    model: db.faq as unknown as Delegate,
    schema: faqSchema,
    label: 'FAQ',
    name: (item) => String(item.question),
  },
  logos: {
    model: db.clientLogo as unknown as Delegate,
    schema: clientLogoSchema,
    label: 'client logo',
    name: (item) => String(item.name),
  },
  products: {
    model: db.product as unknown as Delegate,
    schema: productSchema,
    label: 'product',
    name: (item) => String(item.name),
    toDb: (data) => ({ ...data, ...(data.features ? { features: data.features as Prisma.InputJsonValue } : {}) }),
    check: async (data, id) => {
      const anchor = typeof data.anchorId === 'string' ? data.anchorId : '';
      if (!anchor) return;
      if (RESERVED_ANCHORS.has(anchor)) throw badRequest('That anchor is already used by another part of the homepage.', { anchorId: 'Reserved.' });
      const clash = await db.product.findFirst({ where: { anchorId: anchor, ...(id ? { id: { not: id } } : {}) } });
      if (clash) throw badRequest(`"${clash.name}" already uses that anchor.`, { anchorId: 'Already in use.' });
      const features = (data.features as Array<{ id: string }> | undefined) ?? [];
      if (new Set(features.map((feature) => feature.id)).size !== features.length) {
        throw badRequest('Each feature tab needs a unique id.', { features: 'Duplicate feature id.' });
      }
    },
  },
};

function collectionFor(type: string) {
  const collection = collections[type];
  if (!collection) throw notFound('Collection');
  return collection;
}

collectionsRouter.get('/:type', async (req, res) => {
  const collection = collectionFor(String(req.params.type));
  const items = await collection.model.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  res.json({ items });
});

collectionsRouter.post('/:type', async (req, res) => {
  const type = String(req.params.type);
  const collection = collectionFor(type);
  const data = parse(collection.schema.extend({ published: z.boolean().default(true) }), req.body);
  await collection.check?.(data);
  const { _max } = await collection.model.aggregate({ _max: { order: true } });
  const item = await collection.model.create({
    data: { ...(collection.toDb ? collection.toDb(data) : data), order: (_max.order ?? -1) + 1 },
  });
  logActivity(req, 'create', type, `Added ${collection.label} "${collection.name(item)}"`, item.id);
  res.status(201).json({ item });
});

collectionsRouter.post('/:type/reorder', async (req, res) => {
  const type = String(req.params.type);
  const collection = collectionFor(type);
  const { ids } = parse(z.object({ ids: z.array(z.string().max(40)).min(1).max(500) }), req.body);
  const existing = await collection.model.findMany({ select: { id: true } } as object);
  const known = new Set(existing.map((item) => item.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
    throw badRequest('The list changed while you were reordering. Reload and try again.');
  }
  await db.$transaction(ids.map((id, order) => (collection.model.update({ where: { id }, data: { order } }) as unknown as Prisma.PrismaPromise<unknown>)));
  logActivity(req, 'reorder', type, `Reordered ${collection.label}s`);
  res.json({ ok: true });
});

collectionsRouter.patch('/:type/:id', async (req, res) => {
  const type = String(req.params.type);
  const collection = collectionFor(type);
  const id = String(req.params.id);
  const data = parse(collection.schema.partial().extend({ published: z.boolean().optional() }), req.body);
  if (!(await collection.model.findUnique({ where: { id } }))) throw notFound(collection.label);
  await collection.check?.(data, id);
  const item = await collection.model.update({ where: { id }, data: collection.toDb ? collection.toDb(data) : data });
  const what = Object.keys(data).length === 1 && 'published' in data ? (data.published ? 'Published' : 'Hid') : 'Edited';
  logActivity(req, 'update', type, `${what} ${collection.label} "${collection.name(item)}"`, item.id);
  res.json({ item });
});

collectionsRouter.delete('/:type/:id', async (req, res) => {
  const type = String(req.params.type);
  const collection = collectionFor(type);
  const id = String(req.params.id);
  const item = await collection.model.findUnique({ where: { id } });
  if (!item) throw notFound(collection.label);
  await collection.model.delete({ where: { id } });
  logActivity(req, 'delete', type, `Deleted ${collection.label} "${collection.name(item)}"`, id);
  res.json({ ok: true });
});
