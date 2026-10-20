// Assembles what the public site reads. Everything here returns published
// content only, unless an authorised preview explicitly asks for drafts.

import {
  menuLocations,
  productFeatureSchema,
  publicSettingsFrom,
  sectionsSchema,
  seoSchema,
  type MenuLocation,
  type PublicCollections,
  type PublicMenu,
  type PublicMenuItem,
  type PublicPage,
  type Section,
  type Seo,
  type SiteBootstrap,
} from '@workspace/cms-content';
import { z } from 'zod';
import { db } from '../db.ts';
import type { MenuItem, Page } from '../generated/prisma/client.ts';
import { getAllSettings } from './settings.ts';

// ---------------------------------------------------------------------------
// Cache. Every admin write bumps the version, so readers never see stale data
// for longer than one request after a change; the TTL only bounds memory.
// ---------------------------------------------------------------------------

let version = Date.now();
const cache = new Map<string, { version: number; at: number; value: unknown }>();
const TTL_MS = 5 * 60 * 1000;

export function invalidateContent() {
  version = Date.now();
  cache.clear();
}

export function contentVersion() {
  return version;
}

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.version === version && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { version, at: Date.now(), value });
  return value;
}

// Active code snippets, highest-priority first, cached like the rest of the
// public content (invalidated on any admin write).
export function getActiveSnippets() {
  return cached('snippets', () =>
    db.snippet.findMany({ where: { active: true }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] }),
  );
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export type PageSnapshot = {
  title: string;
  excerpt: string;
  featuredImage: string;
  sections: Section[];
  seo: Seo;
  updatedAt: string;
};

export function parseSections(value: unknown): Section[] {
  const parsed = sectionsSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  // Keep whatever sections are individually valid rather than blanking the
  // whole page over one bad block.
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const one = sectionsSchema.element.safeParse(item);
    return one.success ? [one.data] : [];
  });
}

export function parseSeo(value: unknown): Seo {
  const parsed = seoSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : seoSchema.parse({});
}

export function snapshotOf(page: Pick<Page, 'title' | 'excerpt' | 'featuredImage' | 'sections' | 'seo'>): PageSnapshot {
  return {
    title: page.title,
    excerpt: page.excerpt,
    featuredImage: page.featuredImage,
    sections: parseSections(page.sections),
    seo: parseSeo(page.seo),
    updatedAt: new Date().toISOString(),
  };
}

export function slugForPath(path: string): string | null {
  const clean = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (clean === '/') return 'home';
  const match = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(clean);
  return match ? match[1] : null;
}

export function isLive(page: Pick<Page, 'status' | 'publishAt'>, now = new Date()) {
  if (page.status === 'PUBLISHED') return true;
  return page.status === 'SCHEDULED' && Boolean(page.publishAt && page.publishAt <= now);
}

export async function getPublicPage(slug: string, options: { preview?: boolean } = {}): Promise<PublicPage | null> {
  const page = await db.page.findUnique({ where: { slug } });
  if (!page) return null;

  if (options.preview) {
    const snap = snapshotOf(page);
    return { slug: page.slug, ...snap, updatedAt: page.updatedAt.toISOString() };
  }

  const published = page.published as PageSnapshot | null;
  // A scheduled page with a previous published version keeps serving that
  // version until its schedule fires.
  if (!published) return null;
  if (page.status !== 'PUBLISHED' && page.status !== 'SCHEDULED') return null;
  return {
    slug: page.slug,
    title: published.title,
    excerpt: published.excerpt,
    featuredImage: published.featuredImage,
    sections: parseSections(published.sections),
    seo: parseSeo(published.seo),
    updatedAt: published.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

function buildTree(items: MenuItem[], parentId: string | null, enabledOnly: boolean): PublicMenuItem[] {
  return items
    .filter((item) => item.parentId === parentId && (!enabledOnly || item.enabled))
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      id: item.id,
      label: item.label,
      url: item.url,
      external: item.external,
      newTab: item.newTab,
      children: buildTree(items, item.id, enabledOnly),
    }));
}

export async function getPublicMenus(): Promise<Record<MenuLocation, PublicMenu>> {
  const menus = await db.menu.findMany({ include: { items: true } });
  const result = {} as Record<MenuLocation, PublicMenu>;
  for (const location of menuLocations) {
    const menu = menus.find((m) => m.location === location);
    result[location] = {
      location,
      cta: { enabled: menu?.ctaEnabled ?? false, label: menu?.ctaLabel ?? '' },
      items: menu ? buildTree(menu.items, null, true) : [],
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

const featuresSchema = z.array(productFeatureSchema);
const byOrder = { orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }] };

export async function getPublicCollections(): Promise<PublicCollections> {
  const where = { published: true };
  const [metrics, testimonials, faqs, logos, products] = await Promise.all([
    db.metric.findMany({ where, ...byOrder }),
    db.testimonial.findMany({ where, ...byOrder }),
    db.faq.findMany({ where, ...byOrder }),
    db.clientLogo.findMany({ where, ...byOrder }),
    db.product.findMany({ where, ...byOrder }),
  ]);
  return {
    metrics: metrics.map(({ id, value, label }) => ({ id, value, label })),
    testimonials: testimonials.map(({ id, quote, role, segment, outcome, explanation }) => ({
      id,
      quote,
      role,
      segment,
      outcome,
      explanation,
    })),
    faqs: faqs.map(({ id, question, answer }) => ({ id, question, answer })),
    logos: logos.map(({ id, name, imageUrl, legacyMark }) => ({
      id,
      name,
      imageUrl,
      legacyMark: (legacyMark as PublicCollections['logos'][number]['legacyMark']) ?? null,
    })),
    products: products.flatMap((product) => {
      const features = featuresSchema.safeParse(product.features);
      if (!features.success || features.data.length === 0) return [];
      return [
        {
          id: product.id,
          name: product.name,
          kicker: product.kicker,
          anchorId: product.anchorId,
          introTitle: product.introTitle,
          introBody: product.introBody,
          bridge: product.bridge,
          ctaLabel: product.ctaLabel,
          features: features.data,
        },
      ];
    }),
  };
}

// ---------------------------------------------------------------------------
// Bootstrap — one request gives the site everything a page needs.
// ---------------------------------------------------------------------------

export async function getSiteBootstrap(path: string, options: { preview?: boolean } = {}): Promise<SiteBootstrap> {
  const slug = slugForPath(path);
  const shared = await cached('shared', async () => {
    const [settings, menus, collections] = await Promise.all([getAllSettings(), getPublicMenus(), getPublicCollections()]);
    return { settings, menus, collections };
  });

  const page = slug
    ? options.preview
      ? await getPublicPage(slug, { preview: true })
      : await cached(`page:${slug}`, () => getPublicPage(slug))
    : null;

  return {
    settings: publicSettingsFrom(shared.settings.site, shared.settings.demo, shared.settings.forms),
    menus: shared.menus,
    collections: shared.collections,
    page,
    preview: Boolean(options.preview),
    generatedAt: new Date(contentVersion()).toISOString(),
  };
}
