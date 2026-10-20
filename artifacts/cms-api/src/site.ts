// Serves what the public sees: uploads, sitemap and robots always; and, once
// SITE_DIST / ADMIN_DIST point at built bundles, the site and the admin too.
//
// Serving the site from here is what makes SEO real for a single-page app:
// each response's HTML already carries that page's title, description,
// canonical URL, Open Graph tags and structured data, plus the page content
// itself, so crawlers and link previews never depend on running JavaScript.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { type PublicResource, resourceTypeSegment, type Seo, type SeoSettings, type SiteBootstrap } from '@workspace/cms-content';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { db } from './db.ts';
import { env } from './env.ts';
import { Prisma } from './generated/prisma/client.ts';
import { loadSession, userCan } from './lib/auth.ts';
import { getActiveSnippets, getSiteBootstrap, parseSeo, slugForPath } from './lib/content.ts';
import { logNotFound } from './lib/monitor404.ts';
import { getPublicResource, liveWhere } from './lib/posts.ts';
import { addNonce, buildAdminCsp, buildPageCsp, newNonce } from './lib/security.ts';
import { getSetting } from './lib/settings.ts';
import { uploadRoot } from './lib/storage.ts';
import { normalisePath } from './routes/redirects.ts';

const escapeAttr = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

// JSON inside a <script> must not be able to close the tag.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const BACKSLASH = String.fromCharCode(92);
const safeJson = (value: unknown) =>
  JSON.stringify(value)
    .split('<').join(`${BACKSLASH}u003c`)
    .split(LS).join(`${BACKSLASH}u2028`)
    .split(PS).join(`${BACKSLASH}u2029`);

const absolute = (url: string) => (!url ? '' : /^https?:\/\//i.test(url) ? url : `${env.siteUrl}${url.startsWith('/') ? '' : '/'}${url}`);

const SKIP = /^\/(api|admin|uploads|assets)(\/|$)/;

// ---------------------------------------------------------------------------
// sitemap.xml and robots.txt
// ---------------------------------------------------------------------------

async function sitemap(_req: Request, res: Response) {
  const [pages, posts, seo] = await Promise.all([
    db.page.findMany({ where: { status: { in: ['PUBLISHED', 'SCHEDULED'] }, published: { not: Prisma.DbNull } }, select: { slug: true, published: true, updatedAt: true } }),
    db.post.findMany({ where: liveWhere(), select: { slug: true, type: true, seo: true, featuredImage: true, updatedAt: true }, orderBy: { publishedAt: 'desc' } }),
    getSetting('seo'),
  ]);
  const urls: { loc: string; lastmod: Date; priority: string; image?: string }[] = [];
  for (const page of pages) {
    const published = page.published as { seo?: Seo; featuredImage?: string } | null;
    if (!published || parseSeo(published.seo).noIndex) continue;
    urls.push({ loc: page.slug === 'home' ? `${env.siteUrl}/` : `${env.siteUrl}/${page.slug}`, lastmod: page.updatedAt, priority: page.slug === 'home' ? '1.0' : '0.7', image: published.featuredImage || undefined });
  }
  for (const post of posts.filter((p) => !parseSeo(p.seo).noIndex)) {
    urls.push({ loc: `${env.siteUrl}/resources/${resourceTypeSegment[post.type]}/${post.slug}`, lastmod: post.updatedAt, priority: '0.5', image: post.featuredImage || undefined });
  }
  const imageTag = (img: string) => `\n    <image:image><image:loc>${escapeAttr(absolute(img))}</image:loc></image:image>`;
  const body = urls
    .map((url) => `  <url>\n    <loc>${escapeAttr(url.loc)}</loc>\n    <lastmod>${url.lastmod.toISOString().slice(0, 10)}</lastmod>\n    <priority>${url.priority}</priority>${seo.sitemapImages && url.image ? imageTag(url.image) : ''}\n  </url>`)
    .join('\n');
  res.type('application/xml').setHeader('Cache-Control', 'public, max-age=3600');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`);
}

async function robots(_req: Request, res: Response) {
  const [site, seo] = await Promise.all([getSetting('site'), getSetting('seo')]);
  const lines = ['User-agent: *'];
  if (site.maintenanceMode) {
    lines.push('Disallow: /');
  } else {
    lines.push('Allow: /', 'Disallow: /admin', 'Disallow: /api', ...site.robotsDisallow.map((rule) => `Disallow: ${rule}`));
  }
  lines.push('', `Sitemap: ${env.siteUrl}/sitemap.xml`);
  if (seo.robotsTxtCustom.trim()) lines.push('', seo.robotsTxtCustom.trim());
  lines.push('');
  res.type('text/plain').setHeader('Cache-Control', 'public, max-age=3600');
  res.send(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Redirects and maintenance
// ---------------------------------------------------------------------------

async function redirects(req: Request, res: Response, next: NextFunction) {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || SKIP.test(req.path)) return next();
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const candidates = [normalisePath(req.path + query), normalisePath(req.path)];
  const match = await db.redirect.findFirst({ where: { fromPath: { in: candidates }, enabled: true } });
  if (!match) return next();
  db.redirect.update({ where: { id: match.id }, data: { hits: { increment: 1 }, lastHitAt: new Date() } }).catch(() => undefined);
  res.redirect(match.statusCode, match.toPath);
}

function maintenancePage(message: string, siteName: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeAttr(siteName)} — back soon</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c14;color:#fff;font-family:Inter,system-ui,sans-serif;padding:24px}main{max-width:520px;text-align:center}h1{font-size:clamp(32px,6vw,48px);letter-spacing:-.04em;margin:0 0 16px}p{color:rgba(255,255,255,.75);line-height:1.7;margin:0}</style></head><body><main><h1>${escapeAttr(siteName)}</h1><p>${escapeAttr(message)}</p></main></body></html>`;
}

// ---------------------------------------------------------------------------
// HTML with per-page SEO
// ---------------------------------------------------------------------------

let template: { html: string; mtime: number } | null = null;

async function loadTemplate(file: string) {
  const info = await stat(file);
  if (!template || template.mtime !== info.mtimeMs) template = { html: await readFile(file, 'utf8'), mtime: info.mtimeMs };
  return template.html;
}

type Head = {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: 'website' | 'article';
  noIndex: boolean;
  robots: string;
  home?: boolean;
  schema: unknown[];
  extra?: string[];
};

function renderHead(head: Head, siteName: string, seo: SeoSettings, nonce: string) {
  const twitterCard = head.ogImage ? seo.twitterCard : 'summary';
  const tags = [
    `<title>${escapeAttr(head.title)}</title>`,
    `<meta name="description" content="${escapeAttr(head.description)}" />`,
    `<meta name="robots" content="${escapeAttr(head.robots)}" />`,
    head.canonical && !head.noIndex ? `<link rel="canonical" href="${escapeAttr(head.canonical)}" />` : '',
    `<meta property="og:site_name" content="${escapeAttr(siteName)}" />`,
    `<meta property="og:type" content="${head.ogType}" />`,
    `<meta property="og:title" content="${escapeAttr(head.ogTitle)}" />`,
    `<meta property="og:description" content="${escapeAttr(head.ogDescription)}" />`,
    head.canonical ? `<meta property="og:url" content="${escapeAttr(head.canonical)}" />` : '',
    head.ogImage ? `<meta property="og:image" content="${escapeAttr(head.ogImage)}" />` : '',
    seo.facebookAppId ? `<meta property="fb:app_id" content="${escapeAttr(seo.facebookAppId)}" />` : '',
    `<meta name="twitter:card" content="${twitterCard}" />`,
    seo.twitterSite ? `<meta name="twitter:site" content="${escapeAttr(seo.twitterSite.startsWith('@') ? seo.twitterSite : `@${seo.twitterSite}`)}" />` : '',
    `<meta name="twitter:title" content="${escapeAttr(head.ogTitle)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(head.ogDescription)}" />`,
    head.ogImage ? `<meta name="twitter:image" content="${escapeAttr(head.ogImage)}" />` : '',
    // Site-verification tags belong on the homepage.
    ...(head.home ? verificationTags(seo) : []),
    ...(head.extra ?? []),
    ...head.schema.map((item) => `<script type="application/ld+json" nonce="${nonce}">${safeJson(item)}</script>`),
  ];
  return tags.filter(Boolean).join('\n    ');
}

function schemaFrom(seo: Seo, fallback: unknown[]) {
  if (!seo.schemaJson.trim()) return fallback;
  try {
    const parsed = JSON.parse(seo.schemaJson);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return fallback;
  }
}

// Fills a title/description template, e.g. "%title% %sep% %sitename%".
function applyTemplate(template: string, vars: Record<string, string>) {
  const all: Record<string, string> = { sep: '|', currentyear: String(new Date().getFullYear()), ...vars };
  return template
    .replace(/%(\w+)%/g, (_, key: string) => all[key] ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// The robots meta content for a page: the basic index/follow plus the global
// and per-page advanced directives and snippet limits.
function robotsContent(noIndex: boolean, itemRobots: string[], seo: SeoSettings) {
  if (noIndex) return 'noindex, nofollow';
  const extra = new Set([...seo.defaultRobots, ...itemRobots]);
  const parts = ['index', extra.has('nofollow') ? 'nofollow' : 'follow'];
  for (const d of ['noarchive', 'noimageindex', 'nosnippet'] as const) if (extra.has(d)) parts.push(d);
  parts.push(`max-snippet:${seo.maxSnippet}`, `max-image-preview:${seo.maxImagePreview}`, `max-video-preview:${seo.maxVideoPreview}`);
  return parts.join(', ');
}

// The Organization / LocalBusiness / Person knowledge-graph node, built from
// the SEO settings and falling back to the site's basic contact details.
function knowledgeGraph(seo: SeoSettings, site: Awaited<ReturnType<typeof getSetting<'site'>>>) {
  const name = seo.orgName || site.siteName;
  const logo = absolute(seo.orgLogo || site.logo.url);
  const sameAs = Object.values(site.social ?? {}).filter(Boolean);
  const address =
    seo.orgStreet || seo.orgCity || seo.orgCountry
      ? { '@type': 'PostalAddress', streetAddress: seo.orgStreet || undefined, addressLocality: seo.orgCity || undefined, addressRegion: seo.orgRegion || undefined, postalCode: seo.orgPostalCode || undefined, addressCountry: seo.orgCountry || undefined }
      : undefined;
  const geo = seo.orgLat && seo.orgLng ? { '@type': 'GeoCoordinates', latitude: seo.orgLat, longitude: seo.orgLng } : undefined;
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': seo.orgType,
    name,
    url: `${env.siteUrl}/`,
    ...(logo ? (seo.orgType === 'Person' ? { image: logo } : { logo }) : {}),
    email: seo.orgEmail || site.contactEmail || undefined,
    telephone: seo.orgPhone || site.phone || undefined,
    address,
    ...(seo.orgType === 'LocalBusiness' ? { geo, priceRange: seo.orgPriceRange || undefined } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
  return node;
}

// A schema.org BreadcrumbList for the given trail of {name, url}.
function breadcrumbSchema(trail: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
}

// Active code snippets that apply to the current path, grouped by where they go
// and wrapped by language. Public pages only — never the admin.
type SnippetRow = { language: string; code: string; location: string; scope: string; paths: unknown };
function renderSnippets(snippets: SnippetRow[], reqPath: string, nonce: string) {
  const groups: Record<'head' | 'body_open' | 'footer', string[]> = { head: [], body_open: [], footer: [] };
  const matchesPath = (paths: unknown) =>
    (Array.isArray(paths) ? (paths as string[]) : []).some((p) => {
      const pat = p.trim().replace(/\/+$/, '') || '/';
      return pat.endsWith('/*') ? reqPath === pat.slice(0, -2) || reqPath.startsWith(pat.slice(0, -1)) : reqPath === pat;
    });
  for (const s of snippets) {
    const inScope =
      s.scope === 'everywhere' ||
      (s.scope === 'home' && reqPath === '/') ||
      (s.scope === 'resources' && (reqPath === '/resources' || reqPath.startsWith('/resources/'))) ||
      (s.scope === 'specific' && matchesPath(s.paths));
    if (!inScope) continue;
    // Snippets are authored by Super Admins, so their inline scripts get the
    // page nonce and run under the strict CSP. HTML snippets may contain their
    // own <script>; nonce those too.
    const html =
      s.language === 'css'
        ? `<style>${s.code}</style>`
        : s.language === 'js'
          ? `<script nonce="${nonce}">${s.code}</script>`
          : addNonce(s.code, nonce);
    (groups[s.location as keyof typeof groups] ?? groups.head).push(html);
  }
  return groups;
}

function verificationTags(seo: SeoSettings) {
  return [
    seo.googleVerify && `<meta name="google-site-verification" content="${escapeAttr(seo.googleVerify)}" />`,
    seo.bingVerify && `<meta name="msvalidate.01" content="${escapeAttr(seo.bingVerify)}" />`,
    seo.yandexVerify && `<meta name="yandex-verification" content="${escapeAttr(seo.yandexVerify)}" />`,
    seo.pinterestVerify && `<meta name="p:domain_verify" content="${escapeAttr(seo.pinterestVerify)}" />`,
    seo.baiduVerify && `<meta name="baidu-site-verification" content="${escapeAttr(seo.baiduVerify)}" />`,
  ].filter(Boolean) as string[];
}

function analytics(site: Awaited<ReturnType<typeof getSetting<'site'>>>, nonce: string) {
  const head: string[] = [];
  const body: string[] = [];
  // Both IDs are validated against strict patterns before they are stored.
  // The nonce lets Tag Manager / gtag.js propagate it to the scripts they load.
  if (site.googleTagManagerId) {
    const id = site.googleTagManagerId;
    head.push(`<script nonce="${nonce}">(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;var n=d.querySelector('[nonce]');n&&j.setAttribute('nonce',n.nonce||n.getAttribute('nonce'));f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');</script>`);
    body.push(`<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`);
  }
  if (site.googleAnalyticsId) {
    const id = site.googleAnalyticsId;
    head.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${id}" nonce="${nonce}"></script>`, `<script nonce="${nonce}">window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');</script>`);
  }
  return { head, body };
}

// Strip the template's own copies of anything we are about to write, so a
// page never ships two titles or two descriptions.
function cleanTemplate(html: string) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="(description|robots|twitter:[^"]+)"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:[^"]+"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<!--\s*TODO:[\s\S]*?-->\s*/gi, '');
}

type Resolved = { status: number; head: Head; bootstrap: SiteBootstrap | null; resource?: PublicResource | null; resources?: boolean };

async function resolve(req: Request, preview: boolean): Promise<Resolved> {
  const [site, seo] = await Promise.all([getSetting('site'), getSetting('seo')]);
  const reqPath = req.path.replace(/\/+$/, '') || '/';
  const robots = (noIndex: boolean, item: string[] = []) => robotsContent(noIndex, item, seo);
  const sep = seo.titleSeparator;
  // Breadcrumbs for an inner page: Home › {label}.
  const crumbs = (label: string, url: string) =>
    seo.breadcrumbsEnabled ? [breadcrumbSchema([{ name: seo.breadcrumbHomeLabel, url: `${env.siteUrl}/` }, { name: label, url }])] : [];
  const defaults: Head = {
    title: site.defaultSeoTitle || site.siteName,
    description: site.defaultMetaDescription,
    canonical: `${env.siteUrl}${reqPath === '/' ? '/' : reqPath}`,
    ogTitle: site.defaultSeoTitle || site.siteName,
    ogDescription: site.defaultMetaDescription,
    ogImage: absolute(site.defaultOgImage),
    ogType: 'website',
    noIndex: preview,
    robots: robots(preview),
    schema: [],
  };
  const notFound: Resolved = {
    status: 404,
    head: { ...defaults, title: `Page not found ${sep} ${site.siteName}`, noIndex: true, robots: 'noindex, nofollow', canonical: '' },
    bootstrap: null,
  };

  if (reqPath === '/resources' || reqPath.startsWith('/resources/')) {
    const bootstrap = await getSiteBootstrap(reqPath, { preview: false });
    const rest = reqPath.slice('/resources/'.length);
    if (reqPath === '/resources') {
      // The listing's title, description and sharing image come from the
      // built-in Resources page, so they are editable like any other page.
      const page = bootstrap.page;
      const title = page?.seo.seoTitle || applyTemplate(seo.pageTitleTemplate, { title: page?.title ?? 'Resources', sitename: site.siteName, sep, excerpt: page?.excerpt ?? '' });
      const description = page?.seo.metaDescription || page?.excerpt || site.defaultMetaDescription;
      const noIndex = preview || Boolean(page?.seo.noIndex);
      return {
        status: 200,
        bootstrap,
        resources: true,
        head: {
          ...defaults,
          title,
          description,
          canonical: page?.seo.canonicalUrl ? absolute(page.seo.canonicalUrl) : defaults.canonical,
          ogTitle: page?.seo.ogTitle || title,
          ogDescription: page?.seo.ogDescription || description,
          ogImage: absolute(page?.seo.ogImage || page?.featuredImage || site.defaultOgImage),
          noIndex,
          robots: robots(noIndex, page?.seo.robots ?? []),
          schema: page ? schemaFrom(page.seo, crumbs(page.title || 'Resources', `${env.siteUrl}/resources`)) : [],
        },
      };
    }
    // A resource detail URL is /resources/{segment}/{slug}.
    const [segment, slug, ...extra] = rest.split('/');
    if (extra.length || !segment || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ...notFound, bootstrap };
    const resource = await getPublicResource(segment, slug, { preview: preview && userCan(req, 'posts.editOwn') });
    if (!resource) return { ...notFound, bootstrap };

    const title = resource.seo.seoTitle || applyTemplate(seo.postTitleTemplate, { title: resource.title, sitename: site.siteName, sep, excerpt: resource.summary });
    const description = resource.seo.metaDescription || applyTemplate(seo.postDescriptionTemplate, { title: resource.title, sitename: site.siteName, sep, excerpt: resource.summary }) || resource.summary || site.defaultMetaDescription;
    const image = absolute(resource.seo.ogImage || resource.cover?.src || site.defaultOgImage);
    const canonical = resource.seo.canonicalUrl ? absolute(resource.seo.canonicalUrl) : `${env.siteUrl}${resource.path}`;
    const noIndex = preview || resource.seo.noIndex;
    const publisher = { '@type': 'Organization', name: site.siteName, logo: site.logo.url ? { '@type': 'ImageObject', url: absolute(site.logo.url) } : undefined };

    let jsonLd: Record<string, unknown> | null = null;
    if (resource.type === 'BLOG') {
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: resource.title,
        description,
        datePublished: resource.publishedAt,
        ...(resource.updatedAt ? { dateModified: resource.updatedAt } : {}),
        image: image || undefined,
        author: resource.author ? { '@type': 'Person', name: resource.author } : undefined,
        publisher,
        mainEntityOfPage: canonical,
      };
    } else if (resource.type === 'EVENT' && resource.event) {
      const e = resource.event;
      const online = e.format === 'Virtual';
      const place = e.location && e.venueAddress ? { '@type': 'Place', name: e.location, address: e.venueAddress } : undefined;
      const virtual = e.attendanceUrl ? { '@type': 'VirtualLocation', url: e.attendanceUrl } : undefined;
      const location = online ? virtual : e.format === 'Hybrid' ? [virtual, place].filter(Boolean) : place;
      if (location) {
        jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: resource.title,
          description,
          startDate: e.startsAt,
          ...(e.endsAt ? { endDate: e.endsAt } : {}),
          eventStatus: e.registrationStatus === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
          eventAttendanceMode: online
            ? 'https://schema.org/OnlineEventAttendanceMode'
            : e.format === 'Hybrid'
              ? 'https://schema.org/MixedEventAttendanceMode'
              : 'https://schema.org/OfflineEventAttendanceMode',
          location,
          ...(image ? { image: [image] } : {}),
          url: canonical,
        };
      }
    }

    // Respect the editor's schema choice: "none" suppresses the automatic type.
    const autoSchema = resource.seo.schemaType === 'none' ? [] : jsonLd ? [jsonLd] : [];
    const breadcrumb = seo.breadcrumbsEnabled
      ? [breadcrumbSchema([
          { name: seo.breadcrumbHomeLabel, url: `${env.siteUrl}/` },
          { name: 'Resources', url: `${env.siteUrl}/resources` },
          { name: resource.title, url: canonical },
        ])]
      : [];
    return {
      status: 200,
      bootstrap,
      resource,
      head: {
        title,
        description,
        canonical,
        ogTitle: resource.seo.ogTitle || title,
        ogDescription: resource.seo.ogDescription || description,
        ogImage: image,
        ogType: 'article',
        noIndex,
        robots: robots(noIndex, resource.seo.robots),
        extra: resource.type === 'BLOG' ? [`<meta property="article:published_time" content="${escapeAttr(resource.publishedAt)}" />`] : [],
        schema: schemaFrom(resource.seo, [...autoSchema, ...breadcrumb]),
      },
    };
  }

  if (!slugForPath(reqPath)) return notFound;
  const bootstrap = await getSiteBootstrap(reqPath, { preview: preview && userCan(req, 'pages.edit') });
  const page = bootstrap.page;
  if (!page) return { ...notFound, bootstrap };

  const isHome = reqPath === '/';
  const title = page.seo.seoTitle || (isHome ? defaults.title : applyTemplate(seo.pageTitleTemplate, { title: page.title, sitename: site.siteName, sep, excerpt: page.excerpt }));
  const description = page.seo.metaDescription || page.excerpt || site.defaultMetaDescription;
  const canonical = page.seo.canonicalUrl ? absolute(page.seo.canonicalUrl) : defaults.canonical;
  const noIndex = preview || page.seo.noIndex;
  const fallbackSchema = isHome
    ? [knowledgeGraph(seo, site), { '@context': 'https://schema.org', '@type': 'WebSite', name: site.siteName, url: `${env.siteUrl}/` }]
    : crumbs(page.title, canonical);
  return {
    status: 200,
    bootstrap,
    head: {
      title,
      description,
      canonical,
      ogTitle: page.seo.ogTitle || title,
      ogDescription: page.seo.ogDescription || description,
      ogImage: absolute(page.seo.ogImage || page.featuredImage || site.defaultOgImage),
      ogType: 'website',
      noIndex,
      robots: robots(noIndex, page.seo.robots),
      home: isHome,
      schema: schemaFrom(page.seo, fallbackSchema),
    },
  };
}

function htmlHandler(templateFile: string) {
  return async (req: Request, res: Response) => {
    const site = await getSetting('site');
    if (site.maintenanceMode && !req.user) {
      res
        .status(503)
        .setHeader('Retry-After', '3600')
        .setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'")
        .type('html')
        .send(maintenancePage(site.maintenanceMessage, site.siteName));
      return;
    }

    const preview = req.query.preview === '1' && Boolean(req.user);
    const [resolved, seo, security] = await Promise.all([resolve(req, preview), getSetting('seo'), getSetting('security')]);
    // One nonce per response: every script the server injects carries it, so
    // only first-party scripts run under the strict CSP.
    const nonce = newNonce();
    // Record real 404s so broken links show up in the 404 monitor.
    if (resolved.status === 404 && !req.user) void logNotFound(req.path, { userAgent: String(req.headers['user-agent'] ?? ''), referrer: String(req.headers.referer ?? '') });
    const tracking = analytics(site, nonce);
    const snippets = renderSnippets(await getActiveSnippets(), req.path.replace(/\/+$/, '') || '/', nonce);
    // The template is our own build output, so noncing its scripts is safe.
    let html = addNonce(cleanTemplate(await loadTemplate(templateFile)), nonce);

    const headBlock = [
      renderHead(resolved.head, site.siteName, seo, nonce),
      site.favicon ? `<link rel="icon" href="${escapeAttr(site.favicon)}" />` : '',
      // Previews fetch the draft themselves; everyone else gets the published
      // content in the page, so there is no request and no flash. The JSON is
      // escaped by safeJson, so it cannot introduce an un-nonced <script>.
      resolved.bootstrap && !preview ? `<script nonce="${nonce}">window.__VEYRA_BOOTSTRAP__=${safeJson(resolved.bootstrap)};</script>` : '',
      resolved.resource && !preview ? `<script nonce="${nonce}">window.__VEYRA_RESOURCE__=${safeJson(resolved.resource)};</script>` : '',
      ...tracking.head,
      addNonce(site.headerScripts, nonce),
      ...snippets.head,
    ]
      .filter(Boolean)
      .join('\n    ');
    html = html.replace(/<\/head>/i, `    ${headBlock}\n  </head>`);
    html = html.replace(/<body([^>]*)>/i, `<body$1>${tracking.body.join('')}${snippets.body_open.join('')}`);
    const footerBlock = [addNonce(site.footerScripts, nonce), ...snippets.footer].filter(Boolean).join('\n    ');
    if (footerBlock) html = html.replace(/<\/body>/i, `${footerBlock}\n  </body>`);
    if (resolved.head.noIndex) res.setHeader('X-Robots-Tag', 'noindex');

    if (security.cspEnabled) {
      const header = security.cspReportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
      res.setHeader(header, buildPageCsp({ nonce, security, site, https: env.siteUrl.startsWith('https://') }));
    }
    res.status(resolved.status).type('html').setHeader('Cache-Control', preview || req.user ? 'no-store' : 'public, max-age=0, must-revalidate');
    res.send(html);
  };
}

export function mountSite(app: Express) {
  // Uploads live on a CMS-controlled origin path: never let one execute as
  // a page (an SVG with script, say) or be sniffed into a different type.
  app.use(
    '/uploads',
    express.static(uploadRoot, {
      fallthrough: false,
      index: false,
      maxAge: '365d',
      immutable: true,
      setHeaders: (res) => {
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  app.get('/sitemap.xml', sitemap);
  app.get('/robots.txt', robots);

  if (env.ADMIN_DIST) {
    const adminDir = path.resolve(env.ADMIN_DIST);
    app.use('/admin', express.static(adminDir, { index: false, maxAge: '1h', setHeaders: (res, file) => {
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } }));
    app.get(/^\/admin(\/.*)?$/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Content-Security-Policy', buildAdminCsp());
      res.sendFile(path.join(adminDir, 'index.html'));
    });
  }

  if (env.SITE_DIST) {
    const siteDir = path.resolve(env.SITE_DIST);
    app.use(redirects);
    app.use(
      express.static(siteDir, {
        index: false,
        setHeaders: (res, file) => {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else if (/\.(mp4|webm|jpe?g|png|webp|avif|ico|svg|woff2?)$/i.test(file)) res.setHeader('Cache-Control', 'public, max-age=2592000');
        },
      }),
    );
    app.get(/.*/, loadSession, htmlHandler(path.join(siteDir, 'index.html')));
  }
}
