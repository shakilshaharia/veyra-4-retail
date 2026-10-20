import {
  detailsSchemaFor,
  readingMinutes,
  resourceTypeSchema,
  resourceTypeSegment,
  seoSchema,
  slugPattern,
  slugify,
  solutionsSchema,
  urlSchema,
  useCaseDetailsSchema,
} from '@workspace/cms-content';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { env } from '../env.ts';
import type { Post, Prisma, ResourceType } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import { requireCap, userCan } from '../lib/auth.ts';
import { parseSeo } from '../lib/content.ts';
import { HttpError, badRequest, forbidden, notFound, parse } from '../lib/http.ts';
import { optionalText, pageArgs, paged, pagingSchema } from '../lib/paging.ts';
import { relatedIdsOf, solutionsOf } from '../lib/posts.ts';
import { plainText, sanitizeRichText } from '../lib/sanitize.ts';

export const postsRouter = Router();
export const taxonomyRouter = Router();

postsRouter.use(requireCap('posts.editAll', 'posts.editOwn'));

const json = (value: unknown) => value as Prisma.InputJsonValue;

const include = {
  author: { select: { id: true, name: true, avatarUrl: true } },
  categories: { select: { id: true, name: true, slug: true } },
  tags: { select: { id: true, name: true, slug: true } },
} as const;

type LoadedPost = Prisma.PostGetPayload<{ include: typeof include }>;

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter a URL slug.')
  .max(100)
  .regex(slugPattern, 'Use lowercase letters, numbers and single hyphens.');

export function postPath(type: ResourceType, slug: string) {
  return `/resources/${resourceTypeSegment[type]}/${slug}`;
}

function describe(post: LoadedPost) {
  const path = postPath(post.type, post.slug);
  return {
    id: post.id,
    slug: post.slug,
    type: post.type,
    path,
    title: post.title,
    excerpt: post.excerpt,
    featuredImage: post.featuredImage,
    featuredImageAlt: post.featuredImageAlt,
    contentJson: post.contentJson,
    contentHtml: post.contentHtml,
    readingMinutes: post.readingMinutes,
    status: post.status,
    featured: post.featured,
    solutions: solutionsOf(post.solutions ?? null),
    details: (post.details ?? null) as unknown,
    publishAt: post.publishAt,
    publishedAt: post.publishedAt,
    seo: parseSeo(post.seo),
    relatedIds: relatedIdsOf(post.relatedIds),
    author: post.author,
    categories: post.categories,
    tags: post.tags,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    liveUrl: `${env.siteUrl}${path}`,
    previewUrl: `${env.siteUrl}${path}?preview=1`,
  };
}

// Authors may only touch their own posts.
function assertCanEdit(req: Request, post: Pick<Post, 'authorId'>) {
  if (userCan(req, 'posts.editAll')) return;
  if (post.authorId !== req.user!.id) throw forbidden('You can only edit your own posts.');
}

async function load(req: Request, id: string) {
  const post = await db.post.findUnique({ where: { id }, include });
  if (!post) throw notFound('Post');
  assertCanEdit(req, post);
  return post;
}

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = base || 'post';
  for (let n = 2; ; n += 1) {
    const clash = await db.post.findUnique({ where: { slug } });
    if (!clash || clash.id === excludeId) return slug;
    slug = `${base}-${n}`;
  }
}

postsRouter.get('/', async (req, res) => {
  const query = parse(
    pagingSchema.extend({
      status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED']).optional(),
      type: resourceTypeSchema.optional(),
      category: optionalText,
      tag: optionalText,
      author: optionalText,
      q: optionalText,
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      sort: z.enum(['updated', 'published', 'title']).default('updated'),
    }),
    req.query,
  );
  const where: Prisma.PostWhereInput = {
    ...(userCan(req, 'posts.editAll') ? (query.author ? { authorId: query.author } : {}) : { authorId: req.user!.id }),
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.category ? { categories: { some: { slug: query.category } } } : {}),
    ...(query.tag ? { tags: { some: { slug: query.tag } } } : {}),
    ...(query.q
      ? { OR: [{ title: { contains: query.q } }, { excerpt: { contains: query.q } }, { slug: { contains: query.q } }] }
      : {}),
    ...(query.from || query.to ? { updatedAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
  };
  const orderBy: Prisma.PostOrderByWithRelationInput =
    query.sort === 'title' ? { title: 'asc' } : query.sort === 'published' ? { publishedAt: { sort: 'desc', nulls: 'last' } } : { updatedAt: 'desc' };
  const [items, total] = await Promise.all([
    db.post.findMany({ where, include, orderBy, ...pageArgs(query) }),
    db.post.count({ where }),
  ]);
  res.json(
    paged(
      items.map((post) => {
        const { contentJson: _j, contentHtml: _h, ...rest } = describe(post);
        return rest;
      }),
      total,
      query,
    ),
  );
});

postsRouter.post('/', async (req, res) => {
  const input = parse(
    z.object({ title: z.string().trim().min(1, 'Enter a title.').max(200), type: resourceTypeSchema.default('BLOG') }),
    req.body,
  );
  const post = await db.post.create({
    data: {
      title: input.title,
      type: input.type,
      slug: await uniqueSlug(slugify(input.title)),
      contentJson: json({ type: 'doc', content: [{ type: 'paragraph' }] }),
      contentHtml: '',
      solutions: json([]),
      details: json({}),
      relatedIds: json([]),
      seo: json(seoSchema.parse({})),
      authorId: req.user!.id,
    },
    include,
  });
  logActivity(req, 'create', 'post', `Created ${input.type.toLowerCase()} "${post.title}"`, post.id);
  res.status(201).json({ post: describe(post) });
});

postsRouter.get('/:id', async (req, res) => {
  res.json({ post: describe(await load(req, String(req.params.id))) });
});

const updateSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(200).optional(),
  slug: slugSchema.optional(),
  type: resourceTypeSchema.optional(),
  excerpt: z.string().max(600).optional(),
  featuredImage: urlSchema.optional(),
  featuredImageAlt: z.string().max(300).optional(),
  featured: z.boolean().optional(),
  solutions: solutionsSchema.optional(),
  // Type-specific fields; validated against the resolved type below.
  details: z.record(z.unknown()).optional(),
  // The editor's document, kept so the post re-opens exactly as written.
  contentJson: z.record(z.unknown()).optional(),
  // What the site renders. Sanitised here regardless of what was sent.
  contentHtml: z.string().max(500_000).optional(),
  categoryIds: z.array(z.string().max(40)).max(20).optional(),
  tagIds: z.array(z.string().max(40)).max(40).optional(),
  relatedIds: z.array(z.string().max(40)).max(6).optional(),
  seo: seoSchema.optional(),
  authorId: z.string().max(40).optional(),
});

postsRouter.patch('/:id', async (req, res) => {
  const post = await load(req, String(req.params.id));
  const input = parse(updateSchema, req.body);

  if (input.slug && input.slug !== post.slug) {
    const clash = await db.post.findUnique({ where: { slug: input.slug } });
    if (clash) throw badRequest('Another post already uses that URL.', { slug: 'Already in use.' });
  }
  if (input.authorId && input.authorId !== post.authorId) {
    if (!userCan(req, 'posts.editAll')) throw forbidden('Only Editors can change a post’s author.');
    if (!(await db.user.findUnique({ where: { id: input.authorId } }))) throw badRequest('That author does not exist.', { authorId: 'Unknown user.' });
  }
  if (input.categoryIds?.length) {
    const found = await db.category.count({ where: { id: { in: input.categoryIds } } });
    if (found !== input.categoryIds.length) throw badRequest('One of those categories no longer exists.', { categoryIds: 'Unknown category.' });
  }
  if (input.tagIds?.length) {
    const found = await db.tag.count({ where: { id: { in: input.tagIds } } });
    if (found !== input.tagIds.length) throw badRequest('One of those tags no longer exists.', { tagIds: 'Unknown tag.' });
  }

  const nextType = input.type ?? post.type;
  const typeChanged = input.type !== undefined && input.type !== post.type;
  // Draft saves accept partial details; publishing validates them in full.
  const details =
    input.details !== undefined
      ? json(parse(detailsSchemaFor(nextType, { draft: true }), input.details))
      : typeChanged
        ? json({}) // switching type drops the old type's fields
        : undefined;

  const html = input.contentHtml !== undefined ? sanitizeRichText(input.contentHtml) : undefined;

  // Only one published resource is featured at a time.
  if (input.featured === true) {
    await db.post.updateMany({ where: { id: { not: post.id }, featured: true }, data: { featured: false } });
  }

  const updated = await db.post.update({
    where: { id: post.id },
    data: {
      title: input.title,
      slug: input.slug,
      type: input.type,
      excerpt: input.excerpt,
      featuredImage: input.featuredImage,
      featuredImageAlt: input.featuredImageAlt,
      featured: input.featured,
      solutions: input.solutions ? json(input.solutions) : undefined,
      details,
      contentJson: input.contentJson ? json(input.contentJson) : undefined,
      contentHtml: html,
      readingMinutes: html !== undefined ? readingMinutes(plainText(html)) : undefined,
      relatedIds: input.relatedIds ? json(input.relatedIds.filter((id) => id !== post.id)) : undefined,
      seo: input.seo ? json(input.seo) : undefined,
      authorId: input.authorId,
      categories: input.categoryIds ? { set: input.categoryIds.map((id) => ({ id })) } : undefined,
      tags: input.tagIds ? { set: input.tagIds.map((id) => ({ id })) } : undefined,
    },
    include,
  });

  // Keep the old URL working when the slug or the type (hence the URL segment) changes.
  const oldPath = postPath(post.type, post.slug);
  const newPath = postPath(updated.type, updated.slug);
  if (oldPath !== newPath && post.publishedAt) {
    await db.redirect.upsert({ where: { fromPath: oldPath }, update: { toPath: newPath, statusCode: 301, enabled: true }, create: { fromPath: oldPath, toPath: newPath } });
    await db.redirect.deleteMany({ where: { fromPath: newPath } });
  }

  logActivity(req, 'update', 'post', `Edited post "${updated.title}"`, updated.id);
  res.json({ post: describe(updated) });
});

function assertPublishable(post: LoadedPost) {
  const fields: Record<string, string> = {};
  if (!post.title.trim()) fields.title = 'Add a title.';
  if (!post.excerpt.trim()) fields.excerpt = 'Add a short summary — it shows on the card and in search.';

  if (post.type === 'BLOG') {
    if (!plainText(post.contentHtml)) fields.contentHtml = 'Write some content before publishing.';
  } else {
    const result = detailsSchemaFor(post.type).safeParse(post.details ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) fields[`details.${issue.path.join('.') || 'form'}`] = issue.message;
    } else if (post.type === 'USE_CASE') {
      const useCase = useCaseDetailsSchema.safeParse(post.details ?? {});
      if (useCase.success && useCase.data.approach.length === 0) fields['details.approach'] = 'Add at least one step showing how the solution is applied.';
      if (solutionsOf(post.solutions ?? null).length === 0) fields.solutions = 'Choose at least one solution.';
    }
  }
  if (Object.keys(fields).length) throw badRequest('This resource is not ready to publish yet.', fields);
}

postsRouter.post('/:id/publish', requireCap('posts.publish'), async (req, res) => {
  const post = await load(req, String(req.params.id));
  assertPublishable(post);
  const updated = await db.post.update({
    where: { id: post.id },
    data: { status: 'PUBLISHED', publishAt: null, publishedAt: post.publishedAt ?? new Date() },
    include,
  });
  logActivity(req, 'publish', 'post', `Published post "${updated.title}"`, updated.id);
  res.json({ post: describe(updated) });
});

postsRouter.post('/:id/schedule', requireCap('posts.publish'), async (req, res) => {
  const post = await load(req, String(req.params.id));
  assertPublishable(post);
  const { publishAt } = parse(
    z.object({ publishAt: z.coerce.date().refine((date) => date.getTime() > Date.now() + 30_000, 'Choose a time in the future.') }),
    req.body,
  );
  const updated = await db.post.update({ where: { id: post.id }, data: { status: 'SCHEDULED', publishAt }, include });
  logActivity(req, 'schedule', 'post', `Scheduled post "${updated.title}" for ${publishAt.toISOString()}`, updated.id);
  res.json({ post: describe(updated) });
});

postsRouter.post('/:id/unpublish', async (req, res) => {
  const post = await load(req, String(req.params.id));
  const updated = await db.post.update({ where: { id: post.id }, data: { status: 'DRAFT', publishAt: null }, include });
  logActivity(req, 'unpublish', 'post', `Moved post "${updated.title}" back to draft`, updated.id);
  res.json({ post: describe(updated) });
});

postsRouter.post('/:id/archive', async (req, res) => {
  const post = await load(req, String(req.params.id));
  const updated = await db.post.update({ where: { id: post.id }, data: { status: 'ARCHIVED', publishAt: null }, include });
  logActivity(req, 'archive', 'post', `Archived post "${updated.title}"`, updated.id);
  res.json({ post: describe(updated) });
});

postsRouter.delete('/:id', async (req, res) => {
  const post = await load(req, String(req.params.id));
  // Authors may delete their own drafts; anything that has been live needs an Editor.
  if (!userCan(req, 'posts.delete') && post.publishedAt) {
    throw new HttpError(403, 'Only Editors can delete a post that has been published. Archive it instead.', 'forbidden');
  }
  await db.post.delete({ where: { id: post.id } });
  // Drop it from other posts' related lists.
  // The lists are small JSON arrays, so filtering in code is simpler and more
  // portable than a JSON query.
  const others = await db.post.findMany({ select: { id: true, relatedIds: true } });
  for (const other of others) {
    const ids = relatedIdsOf(other.relatedIds);
    if (ids.includes(post.id)) {
      await db.post.update({ where: { id: other.id }, data: { relatedIds: json(ids.filter((id) => id !== post.id)) } });
    }
  }
  logActivity(req, 'delete', 'post', `Deleted post "${post.title}"`, post.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Categories and tags
// ---------------------------------------------------------------------------

taxonomyRouter.use(requireCap('posts.editAll', 'posts.editOwn'));

const termSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(80),
  slug: slugSchema.optional(),
  description: z.string().max(400).optional(),
});

taxonomyRouter.get('/categories', async (_req, res) => {
  const items = await db.category.findMany({ include: { _count: { select: { posts: true } } }, orderBy: { name: 'asc' } });
  res.json({ items: items.map(({ _count, ...category }) => ({ ...category, postCount: _count.posts })) });
});

taxonomyRouter.post('/categories', requireCap('categories.manage'), async (req, res) => {
  const input = parse(termSchema, req.body);
  const slug = input.slug ?? slugify(input.name);
  if (!slug) throw badRequest('Enter a name with some letters or numbers.', { name: 'Needs letters or numbers.' });
  const category = await db.category.create({ data: { name: input.name, slug, description: input.description ?? '' } });
  logActivity(req, 'create', 'category', `Created category "${category.name}"`, category.id);
  res.status(201).json({ category });
});

taxonomyRouter.patch('/categories/:id', requireCap('categories.manage'), async (req, res) => {
  const input = parse(termSchema.partial(), req.body);
  const category = await db.category.update({ where: { id: String(req.params.id) }, data: input });
  logActivity(req, 'update', 'category', `Edited category "${category.name}"`, category.id);
  res.json({ category });
});

taxonomyRouter.delete('/categories/:id', requireCap('categories.manage'), async (req, res) => {
  // Posts are kept; they simply lose this category.
  const category = await db.category.delete({ where: { id: String(req.params.id) } });
  logActivity(req, 'delete', 'category', `Deleted category "${category.name}"`, category.id);
  res.json({ ok: true });
});

taxonomyRouter.get('/tags', async (_req, res) => {
  const items = await db.tag.findMany({ include: { _count: { select: { posts: true } } }, orderBy: { name: 'asc' } });
  res.json({ items: items.map(({ _count, ...tag }) => ({ ...tag, postCount: _count.posts })) });
});

taxonomyRouter.post('/tags', requireCap('tags.create'), async (req, res) => {
  const input = parse(termSchema.pick({ name: true, slug: true }), req.body);
  const slug = input.slug ?? slugify(input.name);
  if (!slug) throw badRequest('Enter a name with some letters or numbers.', { name: 'Needs letters or numbers.' });
  // Re-adding an existing tag just returns it, which is what an author typing
  // a tag name in the editor expects.
  const tag = await db.tag.upsert({ where: { slug }, update: {}, create: { name: input.name, slug } });
  res.status(201).json({ tag });
});

taxonomyRouter.patch('/tags/:id', requireCap('categories.manage'), async (req, res) => {
  const input = parse(termSchema.pick({ name: true, slug: true }).partial(), req.body);
  const tag = await db.tag.update({ where: { id: String(req.params.id) }, data: input });
  res.json({ tag });
});

taxonomyRouter.delete('/tags/:id', requireCap('categories.manage'), async (req, res) => {
  const tag = await db.tag.delete({ where: { id: String(req.params.id) } });
  logActivity(req, 'delete', 'tag', `Deleted tag "${tag.name}"`, tag.id);
  res.json({ ok: true });
});

// Every author's name, for the author filter and the author picker.
taxonomyRouter.get('/authors', async (_req, res) => {
  const authors = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });
  res.json({ items: authors });
});
