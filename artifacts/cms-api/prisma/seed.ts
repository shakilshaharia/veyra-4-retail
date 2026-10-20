// Seeds the CMS from the site's current content.
//
//   pnpm db:seed                 settings, pages, collections, menus, media
//                                registry and a first Super Admin
//   pnpm db:seed --with-samples  also Editor/Author test accounts, sample
//                                categories, tags and draft posts
//
// Safe to run repeatedly: it only creates what is missing and never
// overwrites content someone has edited.

import { randomBytes } from 'node:crypto';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  defaultCollections,
  defaultContactSections,
  defaultDemoSettings,
  defaultEmailSettings,
  defaultFormSettings,
  defaultSeoSettings,
  defaultHomeSections,
  defaultMenus,
  defaultPages,
  defaultResourcesSections,
  defaultSiteSettings,
  menuLocations,
} from '@workspace/cms-content';
import sharp from 'sharp';
import { db } from '../src/db.ts';
import { env } from '../src/env.ts';
import type { Prisma } from '../src/generated/prisma/client.ts';
import { hashPassword } from '../src/lib/auth.ts';
import { snapshotOf } from '../src/lib/content.ts';

const withSamples = process.argv.includes('--with-samples');
const json = (value: unknown) => value as Prisma.InputJsonValue;
const created: string[] = [];

function generatedPassword() {
  // 20 chars of URL-safe base64 always contains letters; add a digit to be sure.
  return `${randomBytes(15).toString('base64url')}7`;
}

async function seedSettings() {
  const groups = { site: defaultSiteSettings, demo: defaultDemoSettings, forms: defaultFormSettings, email: defaultEmailSettings, seo: defaultSeoSettings };
  for (const [key, value] of Object.entries(groups)) {
    const exists = await db.setting.findUnique({ where: { key } });
    if (!exists) {
      await db.setting.create({ data: { key, value: json(value) } });
      created.push(`setting:${key}`);
    }
  }
}

async function seedPages(authorId: string) {
  const pages = [
    { slug: 'home', template: 'home', base: defaultPages.home, sections: defaultHomeSections },
    { slug: 'contact', template: 'default', base: defaultPages.contact, sections: defaultContactSections },
    { slug: 'resources', template: 'resources', base: defaultPages.resources, sections: defaultResourcesSections },
  ];
  for (const page of pages) {
    const exists = await db.page.findUnique({ where: { slug: page.slug } });
    if (exists) continue;
    const working = {
      title: page.base.title,
      excerpt: page.base.excerpt,
      featuredImage: page.base.featuredImage,
      sections: json(page.sections),
      seo: json(page.base.seo),
    };
    await db.page.create({
      data: {
        slug: page.slug,
        template: page.template,
        isSystem: true,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        ...working,
        published: json(snapshotOf({ ...working, sections: page.sections, seo: page.base.seo })),
        authorId,
        updatedById: authorId,
      },
    });
    created.push(`page:${page.slug}`);
  }
}

async function seedCollections() {
  if ((await db.metric.count()) === 0) {
    await db.metric.createMany({
      data: defaultCollections.metrics.map(({ value, label }, order) => ({ value, label, order })),
    });
    created.push(`metrics x${defaultCollections.metrics.length}`);
  }
  if ((await db.testimonial.count()) === 0) {
    await db.testimonial.createMany({
      data: defaultCollections.testimonials.map(({ id: _id, ...rest }, order) => ({ ...rest, order })),
    });
    created.push(`testimonials x${defaultCollections.testimonials.length}`);
  }
  if ((await db.faq.count()) === 0) {
    await db.faq.createMany({
      data: defaultCollections.faqs.map(({ question, answer }, order) => ({ question, answer, order })),
    });
    created.push(`faqs x${defaultCollections.faqs.length}`);
  }
  if ((await db.clientLogo.count()) === 0) {
    await db.clientLogo.createMany({
      data: defaultCollections.logos.map(({ name, imageUrl, legacyMark }, order) => ({ name, imageUrl, legacyMark, order })),
    });
    created.push(`client logos x${defaultCollections.logos.length}`);
  }
  if ((await db.product.count()) === 0) {
    for (const [order, { id: _id, features, ...rest }] of defaultCollections.products.entries()) {
      await db.product.create({ data: { ...rest, features: json(features), order } });
    }
    created.push(`products x${defaultCollections.products.length}`);
  }
}

async function seedMenus() {
  for (const location of menuLocations) {
    const exists = await db.menu.findUnique({ where: { location } });
    if (exists) continue;
    const source = defaultMenus[location];
    await db.menu.create({
      data: {
        location,
        ctaEnabled: source.cta.enabled,
        ctaLabel: source.cta.label,
        items: {
          create: source.items.map((item, order) => ({
            label: item.label,
            url: item.url,
            external: item.external,
            newTab: item.newTab,
            order,
          })),
        },
      },
    });
    created.push(`menu:${location}`);
  }
}

// The images and videos that ship inside the site build are registered in the
// media library, so editors can see and reuse them like any upload.
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function seedStaticMedia() {
  const publicDir = path.resolve('../veyra-site/public');
  const files = await walk(publicDir);
  let count = 0;
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const mimeType = MIME[ext];
    if (!mimeType) continue;
    const url = '/' + path.relative(publicDir, file).split(path.sep).join('/');
    const storageKey = `static:${url}`;
    if (await db.mediaAsset.findUnique({ where: { storageKey } })) continue;

    const info = await stat(file);
    let width: number | null = null;
    let height: number | null = null;
    const kind = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'document';
    if (kind === 'image' && ext !== '.svg' && ext !== '.ico') {
      const meta = await sharp(file).metadata().catch(() => null);
      width = meta?.width ?? null;
      height = meta?.height ?? null;
    }
    const filename = path.basename(file);
    await db.mediaAsset.create({
      data: {
        filename,
        driver: 'static',
        variants: json([]),
        storageKey,
        url,
        mimeType,
        kind,
        sizeBytes: info.size,
        width,
        height,
        title: filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s\d{10,}$/, ''),
      },
    });
    count += 1;
  }
  if (count) created.push(`media registry x${count}`);
}

async function ensureUser(email: string, name: string, role: 'SUPER_ADMIN' | 'EDITOR' | 'AUTHOR', credentials: string[]) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  const password = generatedPassword();
  const user = await db.user.create({
    data: { email, name, role, passwordHash: await hashPassword(password) },
  });
  credentials.push(`${role.padEnd(12)} ${email}  /  ${password}`);
  created.push(`user:${email}`);
  return user;
}

async function seedSamples(authorId: string, editorId: string) {
  const categories = [
    { name: 'Retail Insights', slug: 'retail-insights', description: 'Trends and practice across online and in-store retail.' },
    { name: 'Product Updates', slug: 'product-updates', description: 'What is new in Veyra and Cerin.' },
  ];
  for (const category of categories) {
    await db.category.upsert({ where: { slug: category.slug }, update: {}, create: category });
  }
  for (const tag of [
    { name: 'Conversion', slug: 'conversion' },
    { name: 'Customer support', slug: 'customer-support' },
  ]) {
    await db.tag.upsert({ where: { slug: tag.slug }, update: {}, create: tag });
  }

  // Starter resources, one of each kind. They are safe, generic examples — no
  // invented figures, and the use case is a general explanation rather than a
  // customer story. Replace or delete them from the admin.
  const now = new Date();
  const eventStart = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 21);
  const eventIso = eventStart.toISOString().replace('Z', '+00:00');
  const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const resources: {
    slug: string;
    title: string;
    type: 'BLOG' | 'USE_CASE' | 'EVENT';
    excerpt: string;
    authorId: string;
    featured?: boolean;
    featuredImage?: string;
    featuredImageAlt?: string;
    solutions: string[];
    contentHtml?: string;
    details?: Record<string, unknown>;
    category?: string;
    tags: string[];
  }[] = [
    {
      slug: 'helping-more-online-shoppers-find-what-they-need',
      title: 'Helping more online shoppers find what they need',
      type: 'BLOG',
      excerpt: 'Small changes to on-site discovery can turn more browsing into buying — here is where to start.',
      authorId,
      featured: true,
      featuredImage: '/media/posters/In-Page_Recommendations_1791304236000.jpg',
      featuredImageAlt: 'Shopper browsing on a tablet',
      solutions: ['Veyra Online'],
      contentHtml:
        '<p>Retailers already bring shoppers in. The opportunity is helping more of them find what they need, in their own words.</p><h2>Start with the questions people actually ask</h2><p>Look at your site search logs and support tickets. The phrases people use are the language your product discovery should speak.</p><ul><li>Group questions by intent, not by product.</li><li>Answer the top ten before anything else.</li></ul><h2>Make the next step obvious</h2><p>Every answer should lead somewhere: a product, a guide, or a person.</p>',
      category: 'retail-insights',
      tags: ['conversion'],
    },
    {
      slug: 'giving-store-associates-answers-in-the-moment',
      title: 'Giving store associates answers in the moment',
      type: 'BLOG',
      excerpt: 'When associates can check stock, details and alternatives instantly, conversations keep moving.',
      authorId: editorId,
      featuredImage: '/figma/figma-in-person.png',
      featuredImageAlt: 'Associate helping a customer in store',
      solutions: ['Veyra In-Person'],
      contentHtml:
        '<p>In-store, momentum matters. A question the associate cannot answer quickly is where a sale stalls.</p><h2>Put the catalogue in their hand</h2><p>Stock, specifications and alternatives, searchable in plain language.</p>',
      category: 'retail-insights',
      tags: ['customer-support'],
    },
    {
      slug: 'reducing-predictable-support-volume-with-cerin',
      title: 'Reducing predictable support volume with Cerin',
      type: 'USE_CASE',
      excerpt: 'How a retail support team can deflect routine questions while keeping a human path for the rest.',
      authorId,
      solutions: ['Cerin'],
      details: {
        industry: 'Retail support',
        challenge:
          'A large share of incoming messages are predictable: order status, returns, store hours. They crowd out the conversations that need a person.',
        approach: [
          'Map the top recurring questions from past tickets.',
          'Let Cerin resolve those instantly, with the exact policy wording.',
          'Hand over to an agent with full context when a question is not routine.',
        ],
        benefits: ['Faster answers for common questions', 'Agents spend time on higher-value conversations', 'Consistent, policy-accurate responses'],
        verifiedOutcomes: [],
        customerStory: false,
      },
      category: 'product-updates',
      tags: ['customer-support'],
    },
    {
      slug: 'webinar-turning-customer-questions-into-revenue',
      title: 'Webinar: Turning customer questions into revenue',
      type: 'EVENT',
      excerpt: 'A 45-minute session on using everyday customer questions to lift conversion and basket value.',
      authorId,
      solutions: ['Veyra Online', 'Cerin'],
      details: {
        startsAt: eventIso,
        timeZone: 'Europe/London',
        format: 'Virtual',
        attendanceUrl: 'https://example.com/webinar',
        registrationStatus: 'open',
        registrationUrl: 'https://example.com/register',
        audience: 'Retail and e-commerce teams responsible for conversion and customer support.',
        learn: ['Where routine questions quietly cost you sales', 'How to turn answers into next steps', 'What to measure first'],
        agenda: [
          { time: '14:00', title: 'Why questions are a revenue signal' },
          { time: '14:20', title: 'Live walkthrough' },
          { time: '14:40', title: 'Q&A' },
        ],
        speakers: [{ name: 'Veyra team', role: 'Product' }],
      },
      category: 'product-updates',
      tags: ['conversion'],
    },
  ];

  for (const r of resources) {
    if (await db.post.findUnique({ where: { slug: r.slug } })) continue;
    const html = r.contentHtml ?? '';
    await db.post.create({
      data: {
        slug: r.slug,
        title: r.title,
        type: r.type,
        excerpt: r.excerpt,
        featured: r.featured ?? false,
        featuredImage: r.featuredImage ?? '',
        featuredImageAlt: r.featuredImageAlt ?? '',
        solutions: json(r.solutions),
        details: json(r.details ?? {}),
        contentJson: json({ type: 'doc', content: [{ type: 'paragraph' }] }),
        contentHtml: html,
        relatedIds: json([]),
        readingMinutes: Math.max(1, Math.round(plain(html).split(' ').filter(Boolean).length / 225)),
        status: 'PUBLISHED',
        publishedAt: now,
        seo: json({}),
        authorId: r.authorId,
        categories: r.category ? { connect: [{ slug: r.category }] } : undefined,
        tags: { connect: r.tags.map((slug) => ({ slug })) },
      },
    });
    created.push(`${r.type.toLowerCase()}:${r.slug}`);
  }
}

async function main() {
  const credentials: string[] = [];
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@veyra.local').toLowerCase();
  const admin = await ensureUser(adminEmail, process.env.SEED_ADMIN_NAME ?? 'Site Admin', 'SUPER_ADMIN', credentials);

  await seedSettings();
  await seedPages(admin.id);
  await seedCollections();
  await seedMenus();
  await seedStaticMedia();

  if (withSamples) {
    const editor = await ensureUser('editor@veyra.local', 'Test Editor', 'EDITOR', credentials);
    const author = await ensureUser('author@veyra.local', 'Test Author', 'AUTHOR', credentials);
    await seedSamples(author.id, editor.id);
  }

  console.log(created.length ? `[seed] created: ${created.join(', ')}` : '[seed] nothing to do; everything already exists');

  if (credentials.length) {
    console.log('\n[seed] new accounts (passwords are shown once - change them after signing in):');
    for (const line of credentials) console.log(`  ${line}`);
    // Keep a local copy in development only, outside anything that is built
    // or deployed, so the generated passwords are not lost in scrollback.
    if (!env.isProd) {
      await writeFile('.dev-credentials', `${credentials.join('\n')}\n`, { encoding: 'utf8', flag: 'a' });
      console.log('  (also appended to artifacts/cms-api/.dev-credentials)');
    }
  }
}

main()
  .catch((error) => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
