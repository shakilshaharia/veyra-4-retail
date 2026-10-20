# Build a custom CMS backend for a marketing website

You are building a secure, self-hosted content management system (a WordPress-style
admin) that powers an existing marketing website **without changing the site's
front-end look, layout, colours, fonts, animations, routes or responsiveness**.
The site must keep working after every phase. Treat the existing front-end as the
source of truth: only model content that the site actually renders — never invent
sections, fields or pages that do not exist on the front-end.

Work in phases, keep the site runnable at the end of each phase, and verify your
work (typecheck, build, automated API tests, and a real browser check) before
calling anything done. Do not duplicate features. Do not deploy anywhere without
explicit approval.

---

## 1. Before writing any code

1. **Inspect the front-end.** List every page/route, every repeated content block
   (hero, features, testimonials, FAQ, logos, pricing, etc.), every form, the
   header/footer menus, and all media it uses. This becomes the content model.
2. **Decide what is editable** vs. structural. Content that has a fixed, queryable
   shape (slugs, statuses, dates, order) goes in database columns; content whose
   shape is defined by the front-end (page sections, SEO blobs, product feature
   lists) goes in JSON **validated by a schema** so the DB can never hold a shape
   the site cannot render.
3. **Produce, before building:** (a) the architecture, (b) the database schema,
   (c) the list of editable front-end sections, (d) a phased implementation plan.
   Then build.

---

## 2. Tech stack (use these exact choices)

- **Runtime:** Node.js 22.12+ (ESM, `.ts` run directly via `tsx` in dev).
- **Monorepo:** a `pnpm` workspace with a dependency **catalog** and
  `minimumReleaseAge` set so only packages at least a day old are installed.
- **API:** Express 5 (native async error handling), **zod** for all input
  validation, **bcryptjs**, **helmet**, **cookie-parser**, **express-rate-limit**,
  **multer** (memory storage), **sharp** (image processing), **nodemailer**,
  **sanitize-html**, **qrcode** (for two-factor QR codes), **@aws-sdk/client-s3**
  (optional S3 driver). Implement **TOTP with `node:crypto`** (no third-party
  OTP dependency in the auth path).
- **Database:** **MySQL 8** (or MariaDB) via **Prisma 7** with the
  `@prisma/adapter-mariadb` driver adapter and the `prisma-client` generator
  (ESM, generated client committed to `.gitignore`). Use a `prisma.config.ts`.
  (If the host has PostgreSQL instead, swap the adapter and `provider`; the schema
  notes below call out the MySQL-specific constraints.)
- **Admin:** Vite + React 19 + **Tailwind v4** (`@theme` tokens) + **wouter**
  (router with `base="/admin"`) + **@tanstack/react-query** + **TipTap 3** (rich
  text) + **dnd-kit** (drag-reorder) + **sonner** (toasts) + native `<dialog>`.
- **Public site:** whatever the existing front-end already uses (commonly React +
  Vite). You add a thin data layer; you do not rewrite its components.

### Monorepo layout

```
<repo>/
  lib/cms-content/      shared package: zod content schemas, default content,
                        public-payload types, slug helpers. Imported by all apps.
  artifacts/
    <site>/             the public website (existing). Reads content from the API,
                        falls back to bundled defaults if the API is unreachable.
    cms-admin/          the admin SPA, served at /admin
    cms-api/            the API (Express + Prisma). In production it ALSO serves
                        the built site and admin from one Node process.
  scripts/              workspace dev/build helpers
```

Root scripts: `dev:cms` (DB + API watch + site + admin together), `build:cms`
(build site → admin → API in order), `start:cms` (run the built single-process
app). The site's Vite config may require `PORT`/`BASE_PATH`; set them from the
helper scripts (via Node `env`, never a lone `/` in a shell that mangles it).

---

## 3. Core architecture principles

- **Shared content model (`lib/cms-content`).** Every content shape is a zod
  schema here. The API validates every write against it, the admin builds its
  forms from it, and the site types its props from it. Also export the *default
  content* (today's live content) so the site can render from a bundled copy when
  the API is down, and so the DB can be seeded from it.
- **Public payload / bootstrap.** Define a `SiteBootstrap` type (settings, menus,
  collections, and the page for a given path). A single endpoint
  `GET /api/public/bootstrap?path=…` returns it. The site renders from this; it
  falls back to the bundled defaults (with forms disabled) if the fetch fails.
- **Server-rendered SEO (critical).** In production the API serves the site's
  `index.html` and injects, per request: the page's `<title>`, meta description,
  canonical, Open Graph/Twitter tags, JSON-LD, analytics, and the bootstrap data
  as `window.__BOOTSTRAP__`. This makes SEO and link previews real without
  running JS. It also serves `sitemap.xml`, `robots.txt`, redirects, and a
  maintenance-mode 503.
- **In-memory content cache** with a version counter; **any successful admin
  write invalidates it** (hook `res.on('finish')` in the admin router).
- **Settings as validated groups.** A single `Setting` table keyed by group name
  (`site`, `email`, `seo`, …); each group has a zod schema and defaults; stored
  values are merged over defaults on read so new fields are safe.

---

## 4. Database schema (Prisma)

Model exactly what the front-end needs. A typical set:

- **User** (id cuid, email unique, name, passwordHash, role enum, avatarUrl,
  active, lastLoginAt, failedLogins, lockedUntil). **Two-factor fields:**
  `totpSecret` (VarChar, stored **encrypted**), `totpEnabledAt`, `backupCodes`
  (JSON, hashed), `emailOtpEnabled` (bool), `emailOtpCodeHash`,
  `emailOtpExpiresAt`, `emailOtpAttempts` (the current emailed code, hashed).
- **Session** (id = hashed-token id, userId, expiresAt, lastSeenAt, ip,
  userAgent). Store only the **SHA-256 of the session token**, never the token.
- **PasswordResetToken** (tokenHash unique, userId, expiresAt, usedAt).
- **Page** (slug unique, title, excerpt, featuredImage, isSystem, template,
  status enum DRAFT/PUBLISHED/SCHEDULED/ARCHIVED, publishAt, publishedAt,
  `sections` JSON, `seo` JSON, `published` JSON snapshot, hasChanges, authorId,
  updatedById). The `published` snapshot is what the public site reads — editing
  the working copy never changes the live page until you publish.
- **Post/Resource** (slug unique, title, a `type` enum if the site has multiple
  kinds, excerpt, featuredImage/alt, contentJson + contentHtml (MEDIUMTEXT),
  readingMinutes, status, featured bool, publishAt/publishedAt, `seo` JSON,
  type-specific `details` JSON, `solutions`/tags, relatedIds JSON, authorId,
  categories[] / tags[]).
- **Collections** — one model per repeated homepage block the site renders
  (e.g. Metric, Testimonial, Faq, ClientLogo, Product). Each has `order`,
  `published`, and its structured fields; complex per-item data goes in a JSON
  column validated by its schema.
- **MediaAsset** (filename, driver [local/s3/static], storageKey unique, url,
  mimeType, kind, sizeBytes, width/height, title, alt, caption, description,
  `variants` JSON, uploadedById).
- **Menu** (location unique) + **MenuItem** (self-relation for dropdowns, label,
  url, external, newTab, enabled, order).
- **Setting** (key PK, value JSON, updatedById).
- **Snippet** (name, description, language HTML/CSS/JS, code MEDIUMTEXT,
  location head/bodyStart/footer, scope everywhere/homepage/resources/paths,
  paths JSON, priority, tags JSON, active, createdById).
- **Redirect** (fromPath unique, toPath, statusCode 301/302, enabled, hits,
  lastHitAt).
- **NotFoundLog** (path unique, hits, userAgent, referrer, resolved, lastHitAt).
- **FormSubmission** (type enum, status enum NEW/CONTACTED/COMPLETED/SPAM, name,
  email, company, `data` JSON, notes, ipHash, userAgent, emailed).
- **ActivityLog** (userId, action, entityType, entityId, summary, createdAt).

**MySQL specifics:** `String` is VARCHAR(191) — give long fields explicit
`@db.VarChar(n)` sized to the longest value the API accepts; use `@db.MediumText`
for article bodies; **JSON columns cannot have a DB default**, so make them
nullable (`Json?`) and coerce null→`[]`/`{}` in code, or always set them on
create. Use `utf8mb4`. Store list-of-strings (e.g. relatedIds) as JSON arrays,
not a Postgres `String[]`. The local dev database must run its data folder in a
path **without spaces** (MySQL 8 on Windows refuses otherwise).

---

## 5. Features to build (each must fully work and be tested)

### Auth, roles, accounts
- Email + password login. bcrypt (12 rounds). Passwords ≥10 chars with letters
  and digits. **Lock the account for 15 min after 5 failed attempts**, and do a
  dummy bcrypt compare for unknown emails so timing can't reveal which accounts
  exist. Server-side sessions in an httpOnly, SameSite=Lax cookie (Secure
  automatically on https).
- Forgot/reset password (single-use token, 1-hour expiry, emailed link). Profile
  page (name, avatar, change password → signs out other devices), a list of
  active sessions, and a "sign out all other devices" action.
- **Two-factor authentication:** support both authenticator-app TOTP and emailed
  one-time codes. TOTP setup shows a QR code, verifies a code before activation,
  encrypts the secret at rest with AES-256-GCM under `APP_SECRET`, and issues ten
  single-use backup codes (store only their hashes and show the plaintext once).
  Email codes are six digits, expire after 10 minutes, allow at most five failed
  attempts, can be resent with a separate rate limit, and are stored only as a
  hash. The password step returns a short-lived, HMAC-signed challenge; **do not
  create a session until the second factor succeeds**. Accept an authenticator,
  email, or unused backup code according to the methods enabled on the account.
- Let each admin enable/disable their own methods after confirming their current
  password, regenerate backup codes, and recover with a backup code. A Super
  Admin can enable email 2FA for another user and clear all factors for a locked-
  out colleague. If the global policy requires 2FA, force unenrolled admins into
  setup and let them access only auth/profile enrollment endpoints until a method
  is active; do not let them remove their last method. Clearly document that
  rotating `APP_SECRET` invalidates existing authenticator enrollments.
- Detect a new sign-in device/location from prior sessions, record it in the
  activity log, and optionally email the account owner. Never put raw OTPs,
  backup codes, TOTP secrets, challenge contents, or passwords in logs/API
  responses beyond the one-time setup response that intentionally shows codes.
- **Capability-based roles** (not role checks in routes): a capability matrix
  (`permissions.ts`) mapping each role to capabilities (e.g. SUPER_ADMIN=all,
  EDITOR, AUTHOR). Routes call `requireCap('pages.edit')`. Changing what a role
  can do is a one-line edit. Super Admin manages users (invite with emailed
  set-password link; can't change own role or delete self).
- A `create-admin` CLI script and a `--reset` option (prints a generated password
  once; accepts `ADMIN_PASSWORD` from env so it stays out of shell history).

### Pages
- CRUD, drafts, **publish / schedule / unpublish / discard changes**, preview
  (`?preview=1`, signed-in only, shows the working copy). Section manager: add,
  reorder, hide, duplicate sections — only section *types the front-end renders*.
  Per-page SEO. System pages (home/contact/etc.) are editable but not
  deletable/re-sluggable. Changing a slug auto-creates a 301 redirect.
- A background scheduler (every 60s) publishes scheduled items that are due.

### Resources / blog
- Rich-text editor (TipTap), categories, tags, related posts, scheduling, SEO.
- If the front-end has multiple resource kinds (e.g. blog / use-case / event),
  model a `type` with per-type `details` validated by a discriminated schema, and
  per-type public detail pages + structured data.
- Public list + detail endpoints. **Never leak drafts** — a live filter that is
  keyed `OR` must be combined with `AND: [liveWhere(), {…}]`, never spread next to
  another `OR`.

### Media library
- Drag-and-drop upload (multipart, up to N files, size-limited, rate-limited).
  **Detect type by magic bytes, not the extension.** Reject SVGs containing
  scripts/handlers. Strip EXIF by re-encoding. Generate WebP variants at several
  widths. Serve uploads with a sandboxing CSP and `nosniff`. Alt text, replace
  (swaps every reference across content), and **safe delete** (block deletion of
  a file still used anywhere; show where it's used).

### Menus
- Header/footer per layout (e.g. home vs inner pages), dropdowns (one level),
  drag-reorder, per-item enable/disable, optional CTA button.

### Settings (validated groups)
- **site**: logo, footer logo, favicon, contact details, socials, copyright,
  maintenance mode + message, and notification email. Default metadata,
  analytics IDs and robots controls are edited only through the dedicated SEO
  section; custom code is edited only through Code Snippets.
- **demo/forms**: which forms are enabled, CTA copy, interests.
- **email**: admin-configurable **SMTP** (host, port, SSL, user, password,
  from-name, from-address) — stored in the DB, **password masked in all API
  responses** and preserved when the field is left blank on save; a "send test
  email" endpoint; mail transport rebuilt when settings change; falls back to env
  SMTP, then to writing messages to a `dev-mail/` folder in development.
- **seo**: the dedicated SEO section (see §6).
- **security**: require 2FA for all admins, alert on new-device sign-ins, enable
  or disable the public Content-Security-Policy, report-only mode, and validated
  extra source lists for script/connect/frame/image/style/font directives. CSP
  source values must not contain spaces, quotes, semicolons, or other characters
  that could escape a directive. Defaults: CSP on and enforced, new-device alerts
  on, mandatory 2FA off.

### Homepage section manager / collections
- Generic CRUD + reorder for each collection, with a live-ish preview where it
  makes sense.

### Forms
- Store submissions, statuses, CSV export (**neutralise formula-injection** chars
  `= + - @ tab CR` and prepend a BOM), email notifications. **Spam protection:**
  honeypot field (silent fake success, not stored), minimum fill time (too fast =
  stored as SPAM), link-count threshold, optional reCAPTCHA v3, and a rate limit
  per IP.

### Redirects + 404 monitor
- Redirect manager (301/302, loop detection, can't redirect CMS paths). A 404
  monitor that logs missing URLs hit by visitors (skip assets/bots, cap rows) and
  lets you turn one into a redirect in a click.

### Code snippets
- A dedicated, Super-Admin-only manager for trusted HTML, CSS, and JavaScript
  snippets, replacing custom header/footer-script fields in general settings.
  Each snippet has a name/description, head/body-start/footer location, active
  flag, priority, tags, and scope (everywhere, homepage, resources, or explicit
  paths supporting `/*` wildcards). Include search, duplicate, and JSON
  import/export. Validate external script URLs as HTTPS and validate imports with
  zod. This is trusted administrator code, not user-authored rich text.
- Inject active snippets server-side in deterministic priority order. Wrap CSS
  and JS in the appropriate tags and add the page's CSP nonce to every injected
  script, including script tags inside trusted HTML snippets. Explain in the UI
  that inline `on*` handlers are blocked by the strict CSP and authors should use
  `addEventListener`.

### SEO system (see §6).

---

## 6. SEO system (Rank Math-style — comprehensive, no duplication)

Build a **dedicated SEO admin section** plus per-page/post controls. Reuse the
existing per-item SEO, redirects, sitemap and robots — do not create a second
place to edit the same thing.

**Per page & per resource** (one SEO panel component):
- SEO title, meta description, canonical, Open Graph + Twitter overrides.
- **Focus keyword** with a **live content-analysis score (0–100) and checklist**
  (keyword in title / description / URL / content / subheadings / near the start;
  title length 15–60; description length 70–160; content length; has an image;
  keyword density). Compute client-side; store the score for list views.
- **Advanced robots** per page (noindex, nofollow, noarchive, noimageindex,
  nosnippet), **schema type** selector (auto/none/Article/FAQ/…), and custom
  JSON-LD (replaces the automatic type when set).

**Global SEO settings group** with tabs:
- **Titles & Meta:** site default title/description, title **separator**, and
  title/description **templates with variables** (`%title% %sitename% %sep%
  %excerpt% %currentyear%`), site-wide default robots directives, and snippet
  limits (`max-snippet`, `max-image-preview`, `max-video-preview`).
- **Local SEO:** Organization / LocalBusiness / Person knowledge graph (name,
  logo, phone, email, address, geo, price range) → JSON-LD.
- **Social & Verification:** default OG image, Twitter card type + handle,
  Facebook App ID, and site-verification codes (Google, Bing, Yandex, Pinterest,
  Baidu) rendered as meta tags on the homepage.
- **Sitemap & Robots:** image sitemap toggle, breadcrumb schema toggle + labels,
  automatic image alt text on upload, robots.txt Disallow list + custom rules.
- **Analytics:** GA4 / GTM IDs.
- **404 Monitor** (above).

**Rendered server-side** in the HTML `<head>` / files: per-page robots string,
verification tags, Twitter cards, Organization/LocalBusiness/Person JSON-LD,
BreadcrumbList JSON-LD, title/description from templates when a page has no
explicit value, Article/Event/etc. structured data, image entries in
`sitemap.xml`, and the custom lines in `robots.txt`.

**Out of scope** (say so explicitly): Content AI, Google Search Console/Analytics
OAuth dashboards, e-commerce product schema, rank tracking, `.htaccess` editing —
unless the target site needs them.

---

## 7. Security (non-negotiable)

- Validate **every** input with zod; return structured errors
  `{ error: { message, code, fields? } }`.
- **CSRF:** reject state-changing requests whose `Origin` isn't the site's own.
- No-store cache headers on all non-public API responses.
- Rate-limit login, password reset, public forms, and uploads.
- Rate-limit second-factor verification and email-code resend endpoints as well
  as the password step. Combine per-IP throttling with the per-account password
  lockout; do not rely on either one alone.
- Sanitise rich text to an allow-list (iframes only from trusted embed hosts).
- Trust `cf-connecting-ip`/proxy headers only from loopback.
- Store secrets (SMTP password, app secret) outside API responses; never log
  them. Validate env at boot and fail loudly on a missing/weak `APP_SECRET`.
- Send a strict **per-response nonce-based Content-Security-Policy** on public
  HTML. Only scripts carrying that request's nonce or coming from explicitly
  allowed sources may run; nonce the app bundle, server-injected bootstrap data,
  JSON-LD, analytics, custom code, and Code Snippets. Automatically add the
  required Google origins only when GA4/GTM is configured. Keep frames limited
  to the rich-text embed allow-list plus validated administrator additions.
- Give `/admin` its own locked-down CSP (`frame-ancestors 'none'`, first-party
  scripts only). Media responses need `nosniff` and a sandboxing CSP. Add HSTS
  for HTTPS (one year, includeSubDomains), `Permissions-Policy` with unused
  powerful features disabled, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, and an appropriate `X-Frame-Options`.
  Support enforced/report-only/off public CSP modes as an explicit Super Admin
  safety valve, surface a prominent warning when protection is weakened, and
  never weaken the admin or media policies through those settings.

---

## 8. Admin UX

- A left-nav shell grouped by Content / Homepage blocks / Leads / Site, with a
  mobile drawer, capability-gated items, and the site's real logo.
- A dedicated Super-Admin Security screen with 2FA policy, new-device alerts,
  CSP mode and source allow-lists, plus an at-a-glance status for 2FA adoption,
  CSP enforcement, HTTPS/HSTS, and locked accounts. The Users list shows each
  account's enabled 2FA methods and provides the guarded enable-email/recovery
  actions. Profile owns self-service 2FA and session management.
- React Query for all data; optimistic-free, invalidate on write. Unsaved-changes
  guard. Toasts for success/error. Confirmation modals for destructive actions.
- Reusable field components (Input, TextArea with counter, Select, Switch,
  Checkbox, Field with error wiring, Tabs, Card, Badge, Pagination, Modal,
  ImageField/VideoField with a media picker, a string-list editor, a rich-text
  editor, a SEO panel, a publishing box). Mobile-friendly.

---

## 9. Dev / build / deploy

- `dev:cms` starts an **isolated local database** (its own data dir, non-default
  port, bound to localhost — never touch an existing DB service) + API (watch) +
  site + admin, with migrate + seed on first run.
- `build:cms` builds all three; `start:cms` runs the **single Node process** that
  serves the API, the built site, and `/admin`, applying migrations first.
- Seed script: idempotent (creates only what's missing, never overwrites edits),
  seeds settings groups, system pages, collections, menus, a static-media
  registry, and a first Super Admin (prints the generated password once to a
  git-ignored `.dev-credentials`). A `--with-samples` flag adds test accounts and
  a little safe starter content (no invented stats or fake records).
- `.gitignore`: `.env`, DB data dir, uploads, dev-mail, `.dev-credentials`,
  `dist`, generated Prisma client, downloaded tool folders.
- A README covering setup, env vars, migrations, seeding, admin creation, dev
  commands, roles, what's editable, and deployment notes.
- **Deployment:** document it, but do not deploy without explicit approval. Target
  shape to document: a reverse-proxied Node app on a fixed port behind the host's
  web server, with the DB created in the host panel.

---

## 10. Quality bar (how "done" is judged)

- All packages **typecheck** and the production **build succeeds**.
- An **automated API test suite** covering auth/roles, pages publish/schedule,
  resources (and that drafts never leak), collections, media safety, menus,
  settings, forms/spam, redirects, 404 monitor, and SEO rendering — all passing.
- Add focused tests for the security primitives: RFC-compatible TOTP (including
  the accepted time window), secret encryption/decryption and wrong-key failure,
  unique backup-code generation, strict public/admin CSP construction, custom
  CSP source handling, and nonce insertion without replacing an existing nonce.
- A **real browser check** (headless) of the public pages and every admin screen:
  no console errors, correct responsive layout at desktop and mobile, no
  horizontal overflow.
- Verify server-rendered SEO: each page/post ships its own title, description,
  canonical, OG, robots and the right JSON-LD; `sitemap.xml` and `robots.txt` are
  correct.
- **No duplication:** one place to edit each thing; reuse existing features rather
  than re-implementing them; remove dead code and settings that moved.
- The front-end's DOM output must be unchanged by the CMS (prove parity).

Work in phases, keep the site working after each, and report what was built, any
deviations (and why), what's configured off by default, and anything that needs
the owner's input before going live.
