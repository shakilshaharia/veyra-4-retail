import {
  isReservedPageSlug,
  sectionsSchema,
  seoSchema,
  slugPattern,
  slugify,
  urlSchema,
  type Section,
} from '@workspace/cms-content';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { env } from '../env.ts';
import type { Page, Prisma } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import { requireCap } from '../lib/auth.ts';
import { parseSections, parseSeo, snapshotOf } from '../lib/content.ts';
import { HttpError, badRequest, notFound, parse } from '../lib/http.ts';
import { optionalText } from '../lib/paging.ts';

export const pagesRouter = Router();
pagesRouter.use(requireCap('pages.edit'));

const json = (value: unknown) => value as Prisma.InputJsonValue;

// Sections that render a fixed element id or a page-level heading, so a page
// may contain at most one of each.
const SINGLETONS = new Set<Section['type']>(['hero', 'trust', 'metrics', 'experiences', 'testimonials', 'platform', 'faq', 'pageIntro', 'contactForm']);

// The homepage template sits under the transparent header; inner pages sit
// under the solid one, which the hero is not designed for.
export const TEMPLATE_SECTIONS: Record<string, ReadonlySet<Section['type']>> = {
  home: new Set(['hero', 'trust', 'metrics', 'experiences', 'testimonials', 'platform', 'faq', 'richText']),
  default: new Set(['pageIntro', 'richText', 'contactForm', 'trust', 'metrics', 'experiences', 'testimonials', 'platform', 'faq']),
  // The Resources listing: these sections sit above the automatic post grid.
  resources: new Set(['pageIntro', 'richText']),
};

function validateSections(sections: Section[], template: string) {
  const allowed = TEMPLATE_SECTIONS[template] ?? TEMPLATE_SECTIONS.default;
  const seenTypes = new Set<string>();
  const seenIds = new Set<string>();
  const fields: Record<string, string> = {};
  sections.forEach((section, index) => {
    if (!allowed.has(section.type)) fields[`sections.${index}`] = `A "${section.type}" section cannot be used on this page template.`;
    if (SINGLETONS.has(section.type)) {
      if (seenTypes.has(section.type)) fields[`sections.${index}`] = `Only one "${section.type}" section is allowed per page.`;
      seenTypes.add(section.type);
    }
    if (seenIds.has(section.id)) fields[`sections.${index}.id`] = 'Section ids must be unique.';
    seenIds.add(section.id);
  });
  if (Object.keys(fields).length) throw badRequest('Some sections need attention.', fields);
}

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter a URL slug.')
  .max(80)
  .regex(slugPattern, 'Use lowercase letters, numbers and single hyphens.')
  .refine((slug) => !isReservedPageSlug(slug), 'That URL is reserved by the site.');

export function pathFor(slug: string) {
  return slug === 'home' ? '/' : `/${slug}`;
}

function describe(page: Page & { author?: { name: string } | null; updatedBy?: { name: string } | null }) {
  const path = pathFor(page.slug);
  return {
    id: page.id,
    slug: page.slug,
    path,
    title: page.title,
    excerpt: page.excerpt,
    featuredImage: page.featuredImage,
    template: page.template,
    isSystem: page.isSystem,
    status: page.status,
    publishAt: page.publishAt,
    publishedAt: page.publishedAt,
    hasPublishedVersion: page.published !== null,
    hasChanges: page.hasChanges,
    sections: parseSections(page.sections),
    seo: parseSeo(page.seo),
    author: page.author?.name ?? null,
    updatedBy: page.updatedBy?.name ?? null,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    liveUrl: `${env.siteUrl}${path}`,
    previewUrl: `${env.siteUrl}${path}${path.includes('?') ? '&' : '?'}preview=1`,
    allowedSections: [...(TEMPLATE_SECTIONS[page.template] ?? TEMPLATE_SECTIONS.default)],
  };
}

const include = { author: { select: { name: true } }, updatedBy: { select: { name: true } } } as const;

async function load(id: string) {
  const page = await db.page.findUnique({ where: { id }, include });
  if (!page) throw notFound('Page');
  return page;
}

async function uniqueSlug(base: string) {
  let slug = base || 'page';
  for (let n = 2; await db.page.findUnique({ where: { slug } }); n += 1) slug = `${base}-${n}`;
  return slug;
}

pagesRouter.get('/', async (req, res) => {
  const query = parse(
    z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED']).optional(), q: optionalText }),
    req.query,
  );
  const pages = await db.page.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [{ title: { contains: query.q } }, { slug: { contains: query.q } }] } : {}),
    },
    include,
    orderBy: [{ isSystem: 'desc' }, { updatedAt: 'desc' }],
  });
  res.json({ items: pages.map((page) => { const { sections: _s, seo: _seo, ...rest } = describe(page); return rest; }) });
});

pagesRouter.post('/', async (req, res) => {
  const input = parse(
    z.object({
      title: z.string().trim().min(1, 'Enter a page title.').max(200),
      slug: z.string().trim().max(80).optional(),
    }),
    req.body,
  );
  const slug = input.slug ? parse(slugSchema, input.slug) : await uniqueSlug(slugify(input.title));
  if (await db.page.findUnique({ where: { slug } })) throw badRequest('Another page already uses that URL.', { slug: 'Already in use.' });
  if (isReservedPageSlug(slug)) throw badRequest('That URL is reserved by the site.', { slug: 'Reserved.' });

  const sections: Section[] = [
    { id: 'intro', type: 'pageIntro', visible: true, eyebrow: '', heading: input.title, lede: '' },
    { id: 'body', type: 'richText', visible: true, html: '' },
  ];
  const page = await db.page.create({
    data: {
      slug,
      title: input.title,
      template: 'default',
      sections: json(sections),
      seo: json(seoSchema.parse({})),
      authorId: req.user!.id,
      updatedById: req.user!.id,
    },
    include,
  });
  logActivity(req, 'create', 'page', `Created page "${page.title}"`, page.id);
  res.status(201).json({ page: describe(page) });
});

pagesRouter.get('/:id', async (req, res) => {
  res.json({ page: describe(await load(String(req.params.id))) });
});

pagesRouter.patch('/:id', async (req, res) => {
  const page = await load(String(req.params.id));
  const input = parse(
    z.object({
      title: z.string().trim().min(1, 'Enter a page title.').max(200).optional(),
      slug: slugSchema.optional(),
      excerpt: z.string().max(600).optional(),
      featuredImage: urlSchema.optional(),
      sections: sectionsSchema.optional(),
      seo: seoSchema.optional(),
    }),
    req.body,
  );

  if (input.slug && input.slug !== page.slug) {
    if (page.isSystem) throw badRequest('This page’s URL is fixed by the site and cannot be changed.', { slug: 'Fixed.' });
    if (await db.page.findUnique({ where: { slug: input.slug } })) throw badRequest('Another page already uses that URL.', { slug: 'Already in use.' });
  }
  if (input.sections) validateSections(input.sections, page.template);

  const updated = await db.page.update({
    where: { id: page.id },
    data: {
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt,
      featuredImage: input.featuredImage,
      sections: input.sections ? json(input.sections) : undefined,
      seo: input.seo ? json(input.seo) : undefined,
      // Edits to a live page wait for "Publish changes".
      hasChanges: page.published !== null ? true : page.hasChanges,
      updatedById: req.user!.id,
    },
    include,
  });

  // Moving a page that people may have bookmarked: send the old address on.
  if (input.slug && input.slug !== page.slug && page.published !== null) {
    const fromPath = pathFor(page.slug);
    const toPath = pathFor(input.slug);
    await db.redirect.upsert({
      where: { fromPath },
      update: { toPath, statusCode: 301, enabled: true },
      create: { fromPath, toPath, statusCode: 301 },
    });
    // Do not leave a redirect pointing away from the page's new home.
    await db.redirect.deleteMany({ where: { fromPath: toPath } });
  }

  logActivity(req, 'update', 'page', `Edited page "${updated.title}"`, updated.id);
  res.json({ page: describe(updated) });
});

pagesRouter.post('/:id/publish', requireCap('pages.publish'), async (req, res) => {
  const page = await load(String(req.params.id));
  validateSections(parseSections(page.sections), page.template);
  const updated = await db.page.update({
    where: { id: page.id },
    data: {
      status: 'PUBLISHED',
      publishAt: null,
      publishedAt: page.publishedAt ?? new Date(),
      published: json(snapshotOf(page)),
      hasChanges: false,
      updatedById: req.user!.id,
    },
    include,
  });
  logActivity(req, 'publish', 'page', `Published page "${updated.title}"`, updated.id);
  res.json({ page: describe(updated) });
});

pagesRouter.post('/:id/schedule', requireCap('pages.publish'), async (req, res) => {
  const page = await load(String(req.params.id));
  const { publishAt } = parse(
    z.object({ publishAt: z.coerce.date().refine((date) => date.getTime() > Date.now() + 30_000, 'Choose a time in the future.') }),
    req.body,
  );
  const updated = await db.page.update({
    where: { id: page.id },
    data: { status: 'SCHEDULED', publishAt, updatedById: req.user!.id },
    include,
  });
  logActivity(req, 'schedule', 'page', `Scheduled page "${updated.title}" for ${publishAt.toISOString()}`, updated.id);
  res.json({ page: describe(updated) });
});

pagesRouter.post('/:id/unpublish', requireCap('pages.publish'), async (req, res) => {
  const page = await load(String(req.params.id));
  if (page.isSystem) throw new HttpError(400, 'Built-in pages are always published; edit them instead.', 'invalid');
  const updated = await db.page.update({
    where: { id: page.id },
    data: { status: 'DRAFT', publishAt: null, updatedById: req.user!.id },
    include,
  });
  logActivity(req, 'unpublish', 'page', `Unpublished page "${updated.title}"`, updated.id);
  res.json({ page: describe(updated) });
});

// Throw away unpublished edits and go back to what visitors see.
pagesRouter.post('/:id/discard', async (req, res) => {
  const page = await load(String(req.params.id));
  const published = page.published as { title: string; excerpt: string; featuredImage: string; sections: unknown; seo: unknown } | null;
  if (!published) throw badRequest('This page has never been published, so there is nothing to go back to.');
  const updated = await db.page.update({
    where: { id: page.id },
    data: {
      title: published.title,
      excerpt: published.excerpt,
      featuredImage: published.featuredImage,
      sections: json(published.sections),
      seo: json(published.seo),
      hasChanges: false,
      updatedById: req.user!.id,
    },
    include,
  });
  logActivity(req, 'discard', 'page', `Discarded unpublished changes to "${updated.title}"`, updated.id);
  res.json({ page: describe(updated) });
});

pagesRouter.delete('/:id', requireCap('pages.delete'), async (req, res) => {
  const page = await load(String(req.params.id));
  if (page.isSystem) throw new HttpError(400, 'Built-in pages (home, contact, resources) cannot be deleted.', 'invalid');
  await db.page.delete({ where: { id: page.id } });
  logActivity(req, 'delete', 'page', `Deleted page "${page.title}"`, page.id);
  res.json({ ok: true });
});
