// The Veyra content model. Every schema here mirrors something the public site
// already renders; nothing is modelled that the frontend cannot show. The API
// validates every save against these, the admin builds its forms from them,
// and the site types its props from them.

import { z } from 'zod';

const text = (max: number) => z.string().max(max).default('');
const id = z.string().min(1).max(64);

// A stored file reference is a URL: either a path under the site (/media/...)
// or an absolute URL from the media library's storage driver.
export const urlSchema = z
  .string()
  .max(2048)
  .refine((value) => value === '' || value.startsWith('/') || /^https?:\/\//i.test(value), {
    message: 'Use a site path starting with / or an http(s) URL.',
  });

export const imageRefSchema = z.object({
  url: urlSchema.default(''),
  alt: text(500),
});

export const videoRefSchema = z.object({
  mp4: urlSchema.default(''),
  webm: urlSchema.default(''),
  poster: urlSchema.default(''),
});

// The icon and colour tones the platform map already uses.
export const iconNames = ['shopping-cart', 'store', 'headphones', 'users', 'monitor', 'database', 'package'] as const;
export const toneNames = ['violet', 'blue', 'teal', 'coral', 'pink'] as const;
export const iconNameSchema = z.enum(iconNames);
export const toneSchema = z.enum(toneNames);

// The bespoke CSS wordmarks the trust strip ships with. A client logo either
// uses one of these, an uploaded image, or falls back to a plain text mark.
export const legacyMarks = ['pulse', 'craftgram', 'swift', 'sparkle', 'techtide', 'lum', 'innovio'] as const;

// ---------------------------------------------------------------------------
// Page sections
// ---------------------------------------------------------------------------

const sectionBase = {
  id,
  visible: z.boolean().default(true),
};

export const heroSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('hero'),
  eyebrow: text(120),
  heading: text(200),
  body: text(600),
  ctaLabel: text(60),
  video: videoRefSchema,
  fallbackImage: urlSchema.default(''),
});

export const trustSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('trust'),
  headline: text(200),
});

export const metricsSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('metrics'),
});

export const experiencesSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('experiences'),
  ariaLabel: text(200),
});

export const testimonialsSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('testimonials'),
  heading: text(200),
});

export const platformStageSchema = z.object({
  id,
  name: text(80),
  detail: text(160),
  icon: iconNameSchema,
  tone: toneSchema,
});

export const platformSystemSchema = z.object({
  id,
  name: text(80),
  icon: iconNameSchema,
  tone: toneSchema,
});

export const platformSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('platform'),
  heading: text(200),
  body: text(600),
  ctaLabel: text(60),
  diagram: imageRefSchema,
  stages: z.array(platformStageSchema).max(8).default([]),
  mapNote: text(200),
  systemsLabel: text(80),
  systems: z.array(platformSystemSchema).max(16).default([]),
});

export const faqSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('faq'),
  eyebrow: text(80),
  heading: text(200),
  image: imageRefSchema,
});

// Inner-page sections (the contact page today, and any page an admin adds).
export const pageIntroSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('pageIntro'),
  eyebrow: text(80),
  heading: text(200),
  lede: text(600),
});

export const contactAsideBlockSchema = z.object({
  id,
  heading: text(120),
  items: z.array(z.string().max(200)).max(12).default([]),
  body: text(600),
});

export const contactFormSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('contactForm'),
  heading: text(200),
  // Shown only while the contact form is switched off in Settings.
  unavailableTitle: text(160),
  unavailableNotice: text(600),
  inquiryTypes: z.array(z.string().max(80)).min(1).max(12),
  solutions: z.array(z.string().max(80)).max(12).default([]),
  submitLabel: text(60),
  successMessage: text(400),
  aside: z.array(contactAsideBlockSchema).max(6).default([]),
});

// Rich text a page author writes in the editor. Stored as sanitised HTML.
export const richTextSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('richText'),
  html: z.string().max(200_000).default(''),
});

export const sectionSchema = z.discriminatedUnion('type', [
  heroSectionSchema,
  trustSectionSchema,
  metricsSectionSchema,
  experiencesSectionSchema,
  testimonialsSectionSchema,
  platformSectionSchema,
  faqSectionSchema,
  pageIntroSectionSchema,
  contactFormSectionSchema,
  richTextSectionSchema,
]);

export const sectionsSchema = z.array(sectionSchema).max(40);

export const sectionTypes = [
  'hero',
  'trust',
  'metrics',
  'experiences',
  'testimonials',
  'platform',
  'faq',
  'pageIntro',
  'contactForm',
  'richText',
] as const;

// ---------------------------------------------------------------------------
// Reusable collections
// ---------------------------------------------------------------------------

export const metricSchema = z.object({
  value: z.string().min(1).max(20),
  label: z.string().min(1).max(160),
});

export const testimonialSchema = z.object({
  quote: z.string().min(1).max(800),
  role: z.string().min(1).max(120),
  segment: text(160),
  outcome: text(120),
  explanation: text(400),
});

export const faqSchema = z.object({
  question: z.string().min(1).max(300),
  answer: text(3000),
});

export const clientLogoSchema = z.object({
  name: z.string().min(1).max(80),
  imageUrl: urlSchema.default(''),
  legacyMark: z.enum(legacyMarks).nullable().default(null),
});

export const productFeatureSchema = z.object({
  id,
  label: z.string().min(1).max(80),
  heading: text(200),
  body: text(800),
  impact: text(200),
  video: videoRefSchema,
});

export const productSchema = z.object({
  name: z.string().min(1).max(80),
  kicker: text(80),
  anchorId: z
    .string()
    .max(60)
    .regex(/^[a-z0-9-]*$/, 'Lowercase letters, numbers and hyphens only.')
    .default(''),
  introTitle: text(200),
  introBody: text(800),
  bridge: text(200),
  ctaLabel: text(60),
  features: z.array(productFeatureSchema).min(1).max(8),
});

// ---------------------------------------------------------------------------
// Menus and settings
// ---------------------------------------------------------------------------

export const menuLocations = ['home-header', 'home-footer', 'page-header', 'page-footer'] as const;
export const menuLocationSchema = z.enum(menuLocations);

export const menuLocationLabels: Record<(typeof menuLocations)[number], string> = {
  'home-header': 'Homepage header',
  'home-footer': 'Homepage footer',
  'page-header': 'Inner page header',
  'page-footer': 'Inner page footer',
};

export const socialNetworks = ['linkedin', 'x', 'facebook', 'instagram', 'youtube'] as const;

export const siteSettingsSchema = z.object({
  siteName: z.string().min(1).max(80).default('Veyra'),
  logo: imageRefSchema,
  footerLogo: imageRefSchema,
  favicon: urlSchema.default(''),
  contactEmail: z.string().max(200).default(''),
  phone: text(60),
  address: text(400),
  social: z.record(z.enum(socialNetworks), urlSchema).default({}),
  whatsapp: urlSchema.default(''),
  copyright: text(200),
  defaultSeoTitle: text(200),
  defaultMetaDescription: text(400),
  defaultOgImage: urlSchema.default(''),
  googleAnalyticsId: z
    .string()
    .max(40)
    .regex(/^(G-[A-Z0-9]+)?$/, 'Expected a GA4 ID like G-XXXXXXX.')
    .default(''),
  googleTagManagerId: z
    .string()
    .max(40)
    .regex(/^(GTM-[A-Z0-9]+)?$/, 'Expected a GTM ID like GTM-XXXXXXX.')
    .default(''),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: text(400),
  headerScripts: z.string().max(20_000).default(''),
  footerScripts: z.string().max(20_000).default(''),
  notificationEmail: z.string().max(200).default(''),
  robotsDisallow: z.array(z.string().max(200)).max(40).default([]),
});

// The demo dialog and where "Get Demo" buttons lead.
export const demoSettingsSchema = z.object({
  mode: z.enum(['dialog', 'url']).default('dialog'),
  url: urlSchema.default(''),
  ctaLabel: z.string().min(1).max(60).default('Get Demo'),
  title: text(120),
  lede: text(400),
  interests: z.array(z.string().max(80)).max(10).default([]),
  submitLabel: text(60),
  successTitle: text(120),
  successMessage: text(400),
});

export const formSettingsSchema = z.object({
  demoEnabled: z.boolean().default(true),
  contactEnabled: z.boolean().default(true),
});

// SMTP so password-reset and form-notification emails can be set up from the
// admin without redeploying. The password is stored but never returned to the
// browser (the API masks it).
export const emailSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  host: text(200),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: text(200),
  pass: z.string().max(400).default(''),
  fromName: text(120),
  fromEmail: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'Enter a valid from address, like no-reply@yourdomain.com.')
    .default(''),
});

// ---------------------------------------------------------------------------
// SEO (shared by pages and posts)
// ---------------------------------------------------------------------------

// Extra robots directives beyond the basic index/follow, as search engines
// understand them.
export const robotsDirectives = ['nofollow', 'noarchive', 'noimageindex', 'nosnippet'] as const;
export const robotsDirectiveSchema = z.enum(robotsDirectives);

// Schema types an editor can pick for a page or resource. "auto" lets the site
// choose (Article for blogs, Event for events, etc.); "none" outputs nothing.
export const schemaTypes = ['auto', 'none', 'Article', 'BlogPosting', 'NewsArticle', 'FAQPage', 'HowTo', 'Product', 'Service', 'WebPage', 'AboutPage', 'ContactPage'] as const;
export const schemaTypeSchema = z.enum(schemaTypes);

export const seoSchema = z.object({
  seoTitle: text(200),
  metaDescription: text(400),
  canonicalUrl: urlSchema.default(''),
  // The word or phrase this page should rank for; drives the SEO analysis.
  focusKeyword: text(120),
  ogTitle: text(200),
  ogDescription: text(400),
  ogImage: urlSchema.default(''),
  noIndex: z.boolean().default(false),
  // Advanced robots directives for this page (nofollow, noarchive, …).
  robots: z.array(robotsDirectiveSchema).max(robotsDirectives.length).default([]),
  // Which schema.org type to output for this page.
  schemaType: schemaTypeSchema.default('auto'),
  // The content-analysis score (0–100), computed in the editor and kept so the
  // lists can show it.
  score: z.number().int().min(0).max(100).default(0),
  schemaJson: z
    .string()
    .max(20_000)
    .default('')
    .refine(
      (value) => {
        if (!value.trim()) return true;
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Schema markup must be valid JSON-LD.' },
    ),
});

// ---------------------------------------------------------------------------
// Code snippets — managed custom HTML / CSS / JS injected into the public site
// ---------------------------------------------------------------------------

export const snippetLanguages = ['html', 'css', 'js'] as const;
export const snippetLocations = ['head', 'body_open', 'footer'] as const;
export const snippetScopes = ['everywhere', 'home', 'resources', 'specific'] as const;

export const snippetLanguageSchema = z.enum(snippetLanguages);
export const snippetLocationSchema = z.enum(snippetLocations);
export const snippetScopeSchema = z.enum(snippetScopes);

export const snippetSchema = z.object({
  name: z.string().trim().min(1, 'Give the snippet a name.').max(120),
  description: text(400),
  language: snippetLanguageSchema,
  code: z.string().max(50_000),
  location: snippetLocationSchema.default('head'),
  scope: snippetScopeSchema.default('everywhere'),
  // Paths this snippet runs on when scope is "specific". A trailing * matches
  // a prefix, e.g. /resources/* .
  paths: z.array(z.string().trim().max(300)).max(50).default([]),
  priority: z.coerce.number().int().min(0).max(1000).default(10),
  active: z.boolean().default(false),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
});

// ---------------------------------------------------------------------------
// Global SEO settings (the dedicated SEO section)
// ---------------------------------------------------------------------------

export const maxImagePreviews = ['none', 'standard', 'large'] as const;
export const orgTypes = ['Organization', 'LocalBusiness', 'Person'] as const;
export const twitterCards = ['summary', 'summary_large_image'] as const;

export const seoSettingsSchema = z.object({
  // Titles & meta templates. Variables: %title% %sitename% %sep% %excerpt%
  // %category% %author% %date% %currentyear%.
  titleSeparator: z.string().min(1).max(5).default('|'),
  postTitleTemplate: z.string().max(200).default('%title% %sep% %sitename%'),
  postDescriptionTemplate: z.string().max(300).default('%excerpt%'),
  pageTitleTemplate: z.string().max(200).default('%title% %sep% %sitename%'),

  // Default extra robots directives applied across the site.
  defaultRobots: z.array(robotsDirectiveSchema).max(robotsDirectives.length).default([]),
  maxSnippet: z.coerce.number().int().min(-1).max(1_000_000).default(-1),
  maxImagePreview: z.enum(maxImagePreviews).default('large'),
  maxVideoPreview: z.coerce.number().int().min(-1).max(1_000_000).default(-1),

  // Local SEO / Knowledge Graph.
  orgType: z.enum(orgTypes).default('Organization'),
  orgName: text(120),
  orgLogo: urlSchema.default(''),
  orgPhone: text(40),
  orgEmail: text(200),
  orgStreet: text(200),
  orgCity: text(120),
  orgRegion: text(120),
  orgPostalCode: text(40),
  orgCountry: text(120),
  orgLat: text(40),
  orgLng: text(40),
  orgPriceRange: text(20),

  // Social.
  twitterCard: z.enum(twitterCards).default('summary_large_image'),
  twitterSite: text(80),
  facebookAppId: text(40),

  // Webmaster verification (the HTML-tag method).
  googleVerify: text(120),
  bingVerify: text(120),
  yandexVerify: text(120),
  pinterestVerify: text(120),
  baiduVerify: text(120),

  // Breadcrumbs.
  breadcrumbsEnabled: z.boolean().default(true),
  breadcrumbSeparator: z.string().max(5).default('/'),
  breadcrumbHomeLabel: z.string().max(40).default('Home'),

  // Sitemap, robots and images.
  sitemapImages: z.boolean().default(true),
  robotsTxtCustom: z.string().max(5000).default(''),
  autoImageAlt: z.boolean().default(false),

  // 404 monitor.
  monitor404: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Security settings (headers, CSP, two-factor policy)
// ---------------------------------------------------------------------------

// A single Content-Security-Policy source token: a host, host pattern or
// scheme such as https://cdn.example.com, *.example.com or https:. The strict
// character set keeps a value from breaking out of its directive in the
// header it is written into.
export const cspSourceSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^[A-Za-z0-9:/*._-]+$/, 'Use a domain or scheme, e.g. https://cdn.example.com (no spaces or quotes).');

export const securitySettingsSchema = z.object({
  // Super Admins can require every admin account to set up an authenticator
  // app before using the dashboard.
  requireTwoFactor: z.boolean().default(false),
  // Email the account owner when a sign-in comes from a device/location not
  // seen before.
  alertOnNewDeviceLogin: z.boolean().default(true),

  // Content-Security-Policy. On by default; the toggles are a safety valve in
  // case a custom snippet or embed needs the policy relaxed. Report-only sends
  // the policy as Content-Security-Policy-Report-Only, which logs violations in
  // the browser console without blocking anything.
  cspEnabled: z.boolean().default(true),
  cspReportOnly: z.boolean().default(false),
  // Extra sources appended to the strict policy for code that loads from
  // another domain (an analytics vendor, a chat widget, a font host, …).
  cspScriptSrc: z.array(cspSourceSchema).max(40).default([]),
  cspConnectSrc: z.array(cspSourceSchema).max(40).default([]),
  cspFrameSrc: z.array(cspSourceSchema).max(40).default([]),
  cspImgSrc: z.array(cspSourceSchema).max(40).default([]),
  cspStyleSrc: z.array(cspSourceSchema).max(40).default([]),
  cspFontSrc: z.array(cspSourceSchema).max(40).default([]),
});

// ---------------------------------------------------------------------------
// Resources (blogs, use cases, events)
// ---------------------------------------------------------------------------

export const resourceTypes = ['BLOG', 'USE_CASE', 'EVENT'] as const;
export const resourceTypeSchema = z.enum(resourceTypes);

// The URL segment and label each type uses on the public site.
export const resourceTypeSegment: Record<(typeof resourceTypes)[number], string> = {
  BLOG: 'blogs',
  USE_CASE: 'use-cases',
  EVENT: 'events',
};
export const resourceTypeLabel: Record<(typeof resourceTypes)[number], string> = {
  BLOG: 'Blog',
  USE_CASE: 'Use case',
  EVENT: 'Event',
};

export const solutionNames = ['Veyra Online', 'Veyra In-Person', 'Cerin'] as const;
export const solutionSchema = z.enum(solutionNames);
export const solutionsSchema = z.array(solutionSchema).max(3).default([]);

export const eventFormats = ['Virtual', 'In person', 'Hybrid'] as const;
export const registrationStatuses = ['open', 'closed', 'cancelled'] as const;

// An offset-aware ISO timestamp, e.g. 2026-05-01T14:00:00+01:00 or ...Z.
const isoWithOffset = z
  .string()
  .max(40)
  .refine((v) => Number.isFinite(Date.parse(v)) && /(Z|[+-]\d{2}:\d{2})$/.test(v), 'Use a full date and time with a time zone offset.');

export const useCaseDetailsSchema = z.object({
  industry: z.string().trim().min(1, 'Name the industry.').max(120),
  challenge: z.string().trim().min(1, 'Describe the business challenge.').max(2000),
  approach: z.array(z.string().trim().min(1).max(400)).max(12).default([]),
  benefits: z.array(z.string().trim().min(1).max(400)).max(12).default([]),
  // Only approved, verified outcomes — never invented figures.
  verifiedOutcomes: z.array(z.string().trim().min(1).max(400)).max(12).default([]),
  // True only for an approved customer success story.
  customerStory: z.boolean().default(false),
});

const timeZoneSchema = z
  .string()
  .min(1, 'Choose a time zone.')
  .max(60)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz }).format();
      return true;
    } catch {
      return false;
    }
  }, 'That is not a valid IANA time zone.');

export const eventDetailsObject = z.object({
  startsAt: isoWithOffset,
  endsAt: isoWithOffset.optional().or(z.literal('')),
  durationMinutes: z.number().int().positive().max(100000).optional(),
  // IANA time zone, e.g. Europe/London.
  timeZone: timeZoneSchema,
  format: z.enum(eventFormats),
  location: text(200),
  audience: text(400),
  learn: z.array(z.string().trim().min(1).max(400)).max(12).default([]),
  agenda: z.array(z.object({ time: text(40), title: z.string().trim().min(1).max(200) })).max(30).default([]),
  speakers: z.array(z.object({ name: z.string().trim().min(1).max(120), role: text(160) })).max(30).default([]),
  registrationStatus: z.enum(registrationStatuses).default('open'),
  registrationUrl: urlSchema.default(''),
  recordingUrl: urlSchema.default(''),
  attendanceUrl: urlSchema.default(''),
  venueAddress: text(300),
});

const endAfterStart = (e: { startsAt?: string; endsAt?: string }) =>
  !e.endsAt || !e.startsAt || Date.parse(e.endsAt) > Date.parse(e.startsAt);

export const eventDetailsSchema = eventDetailsObject.refine(endAfterStart, {
  message: 'The end time must be after the start time.',
  path: ['endsAt'],
});

// A half-filled resource is saved while in draft and only fully validated at
// publish. Draft schemas accept partial details; strict ones require them.
export function detailsSchemaFor(type: (typeof resourceTypes)[number], opts: { draft?: boolean } = {}) {
  if (type === 'USE_CASE') return opts.draft ? useCaseDetailsSchema.partial() : useCaseDetailsSchema;
  if (type === 'EVENT') {
    if (!opts.draft) return eventDetailsSchema;
    // Draft events: fields optional, but a start/end pair must still make sense.
    return eventDetailsObject
      .partial()
      .extend({ startsAt: isoWithOffset.optional().or(z.literal('')), timeZone: timeZoneSchema.optional().or(z.literal('')) })
      .refine(endAfterStart, { message: 'The end time must be after the start time.', path: ['endsAt'] });
  }
  return z.object({}).strip();
}

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ResourceTypeName = z.infer<typeof resourceTypeSchema>;
export type SolutionName = z.infer<typeof solutionSchema>;
export type UseCaseDetails = z.infer<typeof useCaseDetailsSchema>;
export type EventDetails = z.infer<typeof eventDetailsSchema>;

export type ImageRef = z.infer<typeof imageRefSchema>;
export type VideoRef = z.infer<typeof videoRefSchema>;
export type IconName = z.infer<typeof iconNameSchema>;
export type Tone = z.infer<typeof toneSchema>;
export type LegacyMark = (typeof legacyMarks)[number];

export type HeroSection = z.infer<typeof heroSectionSchema>;
export type TrustSection = z.infer<typeof trustSectionSchema>;
export type MetricsSection = z.infer<typeof metricsSectionSchema>;
export type ExperiencesSection = z.infer<typeof experiencesSectionSchema>;
export type TestimonialsSection = z.infer<typeof testimonialsSectionSchema>;
export type PlatformSection = z.infer<typeof platformSectionSchema>;
export type FaqSection = z.infer<typeof faqSectionSchema>;
export type PageIntroSection = z.infer<typeof pageIntroSectionSchema>;
export type ContactFormSection = z.infer<typeof contactFormSectionSchema>;
export type RichTextSection = z.infer<typeof richTextSectionSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section['type'];

export type Metric = z.infer<typeof metricSchema>;
export type Testimonial = z.infer<typeof testimonialSchema>;
export type Faq = z.infer<typeof faqSchema>;
export type ClientLogo = z.infer<typeof clientLogoSchema>;
export type ProductFeature = z.infer<typeof productFeatureSchema>;
export type Product = z.infer<typeof productSchema>;

export type MenuLocation = z.infer<typeof menuLocationSchema>;
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type DemoSettings = z.infer<typeof demoSettingsSchema>;
export type FormSettings = z.infer<typeof formSettingsSchema>;
export type EmailSettings = z.infer<typeof emailSettingsSchema>;
export type SeoSettings = z.infer<typeof seoSettingsSchema>;
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;
export type RobotsDirective = z.infer<typeof robotsDirectiveSchema>;
export type SchemaType = z.infer<typeof schemaTypeSchema>;
export type Snippet = z.infer<typeof snippetSchema>;
export type SnippetLanguage = z.infer<typeof snippetLanguageSchema>;
export type SnippetLocation = z.infer<typeof snippetLocationSchema>;
export type SnippetScope = z.infer<typeof snippetScopeSchema>;
export type Seo = z.infer<typeof seoSchema>;
