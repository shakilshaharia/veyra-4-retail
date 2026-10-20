// Published resources (blogs, use cases, events) as the public site sees them.

import {
  type EventDetails,
  eventDetailsSchema,
  type PublicResource,
  type PublicResourceSummary,
  resourceTypeSegment,
  type SolutionName,
  solutionNames,
  type UseCaseDetails,
  useCaseDetailsSchema,
} from '@workspace/cms-content';
import { db } from '../db.ts';
import type { Prisma, ResourceType } from '../generated/prisma/client.ts';
import { parseSeo } from './content.ts';

export const summaryInclude = {
  author: { select: { name: true, avatarUrl: true } },
  tags: { select: { name: true, slug: true } },
} as const;

type WithSummary = Prisma.PostGetPayload<{ include: typeof summaryInclude }>;

// Live means published, or scheduled with its time already passed (in the
// minute before the scheduler flips the status).
//
// It returns a filter keyed OR, so never spread it next to another OR: the
// second key silently replaces the first and drafts leak. Combine it with
// AND: [liveWhere(), { ...other conditions }] instead.
export function liveWhere(now = new Date()): Prisma.PostWhereInput {
  return {
    OR: [
      { status: 'PUBLISHED', publishedAt: { lte: now } },
      { status: 'SCHEDULED', publishAt: { lte: now } },
    ],
  };
}

// Related post ids are stored as a JSON array of strings.
export function relatedIdsOf(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

const SOLUTION_SET = new Set<string>(solutionNames);
export function solutionsOf(value: Prisma.JsonValue): SolutionName[] {
  return Array.isArray(value) ? value.filter((s): s is SolutionName => typeof s === 'string' && SOLUTION_SET.has(s)) : [];
}

export function useCaseDetailsOf(value: Prisma.JsonValue): UseCaseDetails | null {
  const parsed = useCaseDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function eventDetailsOf(value: Prisma.JsonValue): EventDetails | null {
  const parsed = eventDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function segmentFor(type: ResourceType): string {
  return resourceTypeSegment[type];
}
export function resourcePath(type: ResourceType, slug: string): string {
  return `/resources/${resourceTypeSegment[type]}/${slug}`;
}

export function toResourceSummary(post: WithSummary): PublicResourceSummary {
  const segment = resourceTypeSegment[post.type];
  return {
    type: post.type,
    segment,
    slug: post.slug,
    path: `/resources/${segment}/${post.slug}`,
    title: post.title,
    summary: post.excerpt,
    solutions: solutionsOf(post.solutions ?? null),
    tags: post.tags.map((t) => t.name),
    featured: post.featured,
    cover: post.featuredImage ? { src: post.featuredImage, alt: post.featuredImageAlt } : null,
    publishedAt: (post.publishedAt ?? post.publishAt ?? post.updatedAt).toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    author: post.type === 'BLOG' ? (post.author?.name ?? null) : null,
    readingMinutes: post.type === 'BLOG' ? post.readingMinutes : null,
    useCase: post.type === 'USE_CASE' ? useCaseDetailsOf(post.details ?? null) : null,
    event: post.type === 'EVENT' ? eventDetailsOf(post.details ?? null) : null,
  };
}

// Every live resource, newest first. The site filters, sorts and paginates
// these in the browser (the set is small), matching the reference behaviour.
export async function getPublicResources(): Promise<PublicResourceSummary[]> {
  const posts = await db.post.findMany({ where: liveWhere(), include: summaryInclude, orderBy: { publishedAt: 'desc' } });
  return posts.map(toResourceSummary);
}

// Scores other live resources by shared type and solutions, the way the
// reference does, with the editor's manual picks taking priority.
function scoreRelated(base: PublicResourceSummary, others: PublicResourceSummary[]): PublicResourceSummary[] {
  return others
    .map((o) => ({ o, score: (o.type === base.type ? 1 : 0) + o.solutions.filter((s) => base.solutions.includes(s)).length * 2 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.o);
}

export async function getPublicResource(
  segment: string,
  slug: string,
  options: { preview?: boolean } = {},
): Promise<PublicResource | null> {
  const post = await db.post.findFirst({
    where: options.preview ? { slug } : { AND: [liveWhere(), { slug }] },
    include: summaryInclude,
  });
  if (!post || resourceTypeSegment[post.type] !== segment) return null;

  const summary = toResourceSummary(post);
  const relatedIds = relatedIdsOf(post.relatedIds);

  const all = await db.post.findMany({ where: { AND: [liveWhere(), { id: { not: post.id } }] }, include: summaryInclude });
  const others = all.map(toResourceSummary);
  const bySlug = new Map(all.map((p) => [p.id, toResourceSummary(p)] as const));

  const picked = relatedIds.map((id) => bySlug.get(id)).filter((r): r is PublicResourceSummary => Boolean(r));
  const pickedSlugs = new Set(picked.map((r) => `${r.type}/${r.slug}`));
  const automatic = scoreRelated(summary, others).filter((r) => !pickedSlugs.has(`${r.type}/${r.slug}`));
  const related = [...picked, ...automatic].slice(0, 3);

  return {
    ...summary,
    html: post.type === 'BLOG' ? post.contentHtml : '',
    seo: parseSeo(post.seo),
    related,
  };
}
