# Veyra CMS

A custom content management system for the Veyra website. Editors change the
site's text, images, menus, SEO and settings from a dashboard at `/admin`; the
public site looks and behaves exactly as before and simply reads its content
from the CMS.

```
artifacts/
  veyra-site/   the public website (React + Vite). Reads content from the API,
                falls back to the bundled defaults if the API is unreachable.
  cms-admin/    the dashboard (React + Vite + Tailwind), served at /admin
  cms-api/      the API (Express 5 + Prisma 7 + MySQL). In production it
                also serves the built site and dashboard from one process.
lib/
  cms-content/  shared content schemas, today's default content, helpers
```

## Quick start (local)

Requires Node.js 22.12+, pnpm and MySQL 8.4 (or 8.0 / MariaDB 10.6+). The dev
script runs its **own** private MySQL server on port 3307, bound to localhost,
and never touches a MySQL service you already have. It looks for MySQL in
`MYSQL_BIN`, then `.tools/mysql/bin` (the official "ZIP Archive" for Windows,
unpacked there; git-ignored), then `C:\Program Files\MySQL\MySQL Server *\bin`,
then PATH.

Its data lives in `%LOCALAPPDATA%\veyra-cms\mysql-data` (Windows) or
`~/.veyra-cms/mysql-data`, not in the repo: MySQL 8.4 on Windows cannot restart
from a data folder whose path contains spaces, and this project's path does.
Set `MYSQL_DATA` to use another folder (no spaces).

```sh
pnpm install
cp artifacts/cms-api/.env.example artifacts/cms-api/.env   # then set APP_SECRET
pnpm --filter @workspace/cms-api db:start                   # local MySQL on 3307
pnpm --filter @workspace/cms-api db:deploy                  # apply migrations
pnpm --filter @workspace/cms-api db:seed                    # content + first Super Admin
pnpm dev:cms                                                # everything at once
```

| What | URL |
| --- | --- |
| Website | http://localhost:3000 |
| Dashboard | http://localhost:3001/admin |
| API health | http://localhost:4000/api/health |

The seed prints the generated passwords once and appends them to
`artifacts/cms-api/.dev-credentials` (git-ignored). Sign in, then change the
password from **Profile**.

`pnpm --filter @workspace/cms-api db:seed -- --with-samples` also creates an
Editor and an Author test account, two categories, two tags and draft posts.

## Commands

Run from the workspace root (`pnpm --filter @workspace/cms-api <script>` for the API ones).

| Command | Does |
| --- | --- |
| `pnpm dev:cms` | Database, API (watch mode), website and dashboard together |
| `pnpm build:cms` | Production build of website, dashboard and API |
| `pnpm start:cms` | Run that build as one Node.js app (site, `/admin`, API) on port 3000; `PORT=3002 pnpm start:cms` for another port |
| `db:start` / `db:stop` | Start or stop the local dev database |
| `db:migrate` | Create a migration after editing `prisma/schema.prisma` (dev only) |
| `db:deploy` | Apply pending migrations (use this in production) |
| `db:seed` | Seed content; safe to re-run, never overwrites edits |
| `db:reset` | **Erases** the database and re-applies migrations (dev only) |
| `create-admin` | Create or recover an account from the command line (below) |
| `typecheck` | TypeScript check |
| `start` | Run the production build (`dist/index.mjs`) |

### Creating or recovering an admin

```sh
pnpm --filter @workspace/cms-api create-admin --email you@company.com --name "Your Name"
pnpm --filter @workspace/cms-api create-admin --email you@company.com --role EDITOR
pnpm --filter @workspace/cms-api create-admin --email you@company.com --reset
```

A strong password is generated and printed once. To choose it yourself, put it
in the `CMS_ADMIN_PASSWORD` environment variable (it is never accepted as an
argument, so it stays out of shell history). `--reset` also unlocks and
re-enables the account and signs it out everywhere.

## Environment variables

All are documented in [`.env.example`](.env.example) and validated at startup:
the server refuses to boot with a missing or weak `APP_SECRET` or a bad URL.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | MySQL URL, e.g. `mysql://user:pass@127.0.0.1:3306/veyra_cms?allowPublicKeyRetrieval=true` (URL-encode special characters in the password) |
| `PORT`, `HOST` | Default `4000`, `127.0.0.1` (keep it on loopback behind a proxy) |
| `PUBLIC_SITE_URL` | Public origin; used for canonical URLs, sitemap, emails |
| `ADMIN_URL` | Defaults to `PUBLIC_SITE_URL/admin` |
| `CORS_ORIGINS` | Extra origins allowed to call the API (dev servers) |
| `APP_SECRET` | 32+ random characters |
| `COOKIE_SECURE` | Optional override; Secure cookies are automatic on https |
| `SESSION_DAYS` | Sign-in lifetime, default 14 |
| `STORAGE_DRIVER` | `local` (default, files in `UPLOAD_DIR`) or `s3` (S3, R2, Spaces) |
| `MAX_UPLOAD_MB` | Upload limit, default 100 |
| `SMTP_*`, `MAIL_FROM` | Fallback SMTP for password resets and form notifications. SMTP can also be set from the admin (Settings → Email), which takes priority. Without either, mail is written to `dev-mail/` |
| `RECAPTCHA_SECRET` | Optional reCAPTCHA v3 for forms |
| `SITE_DIST`, `ADMIN_DIST` | Production: built site and dashboard to serve |

## Roles

| | Author | Editor | Super Admin |
| --- | :-: | :-: | :-: |
| Write, publish and delete **own** resources posts | ✓ | ✓ | ✓ |
| Upload media, create tags | ✓ | ✓ | ✓ |
| Edit anyone's posts, categories | | ✓ | ✓ |
| Pages, homepage sections, collections | | ✓ | ✓ |
| Media library (all files), menus, redirects | | ✓ | ✓ |
| Form submissions, activity log | | ✓ | ✓ |
| Site settings, analytics, custom scripts, maintenance mode | | | ✓ |
| Users | | | ✓ |

The matrix lives in [`src/lib/permissions.ts`](src/lib/permissions.ts); routes
check capabilities, never role names.

## What is editable

Only what exists on the site today; no placeholder sections were added.

- **Homepage** — hero, trust bar (client logos), metrics, experiences
  (product tabs with video), testimonials, platform diagram, FAQ. Sections can
  be reordered, hidden, duplicated and previewed before publishing.
- **Contact page** — intro, contact form copy. The contact form is **off** by
  default (as on the live site); switch it on in **Settings → Forms**.
- **Resources** (`/resources`) — three kinds of resource, each with its own
  editor, shown with tabs, search, a solution filter and a featured card:
  - **Blogs** — a rich-text article with author and reading time.
  - **Use cases** — industry, business challenge, approach, benefits and
    (only when real and approved) verified outcomes; marked as a customer
    story only when it genuinely is one.
  - **Events** — date, time zone, format, registration/recording links,
    audience, what-you'll-learn, agenda and speakers, with upcoming/past
    grouping and schema.org Event markup.
  All support solutions (Veyra Online / In-Person / Cerin), a featured flag,
  tags, related resources, scheduling and per-resource SEO. URLs are
  `/resources/{blogs|use-cases|events}/{slug}`.
- **New pages** — built from page intro and rich-text sections.
- **Collections** — metrics, testimonials, FAQs, client logos and products are
  reusable across sections.
- **Menus** — header and footer for the homepage and inner pages, with
  dropdowns, drag-to-reorder and per-item enable/disable.
- **Settings** — logo, favicon, contact details, social links, copyright,
  maintenance mode, the "Get Demo" dialog or booking link, form notifications,
  and SMTP email (Settings → Email). (Default SEO, GA4/GTM and custom code now
  live in their own sections — see below.)
- **Security** (Super Admin) — require two-factor for all admins, toggle
  new-device sign-in alerts, and control the Content-Security-Policy (on /
  report-only / off, plus extra trusted sources). Shows a status snapshot: 2FA
  adoption, CSP state, transport (HTTPS/HSTS) and locked accounts.
- **Code Snippets** — add custom **HTML, CSS or JavaScript** to the public site
  without touching the code: pick the **location** (head / top of body / footer),
  the **scope** (everywhere, homepage, resources, or specific paths with `/*`
  wildcards), a **priority**, tags, and activate/deactivate each snippet. Also
  duplicate, search, and import/export as JSON. External scripts must load over
  https. (This replaces the old header/footer "custom code" field.) PHP /
  shortcode / run-once snippets don't apply to a Node + React site.
- **SEO** — a dedicated **SEO** section (Rank Math-style) plus per-page/post controls:
  - *Per page/post*: focus keyword with a live **SEO analysis score** and
    checklist, SEO title, meta description, canonical, Open Graph/Twitter,
    advanced robots (noindex, nofollow, noarchive, noimageindex, nosnippet),
    schema type, and custom JSON-LD.
  - *Titles & Meta*: title separator and title/description templates with
    variables (`%title%`, `%sitename%`, `%sep%`, `%excerpt%`, `%currentyear%`),
    plus site-wide default robots directives and snippet limits.
  - *Local SEO*: Organization / LocalBusiness / Person knowledge-graph
    (name, logo, phone, email, address, geo) output as JSON-LD.
  - *Social & Verification*: default sharing image, Twitter/X card, and
    Google / Bing / Yandex / Pinterest / Baidu site-verification tags.
  - *Sitemap & Robots*: image sitemap, breadcrumb schema, automatic image alt
    text, robots.txt Disallow list and custom rules.
  - *404 Monitor*: logs missing URLs and turns one into a redirect in a click.
  - Automatic `sitemap.xml`, `robots.txt`, breadcrumb/Article/Event structured
    data, and 301/302 redirects (changing a slug adds the redirect automatically).

  Not included (out of scope for this CMS): Content AI, Google Search Console /
  Analytics OAuth dashboards, WooCommerce product schema, rank tracking, and the
  .htaccess editor.

## Publishing

Pages and posts keep a working copy and a published copy. Saving never changes
the live site; **Publish** does. **Preview** shows the working copy on the real
site (signed-in users only). **Schedule** publishes at a set time (checked every
minute). **Discard changes** returns to the published copy.

## Security notes

- Passwords: bcrypt (12 rounds), 10+ characters with letters and numbers; 5
  failed sign-ins lock the account for 15 minutes; reset links expire in 1 hour
  and are single-use.
- Two-factor authentication: optional per account, two methods, set up from
  **Profile**:
  - **Authenticator app (TOTP)** — scan a QR with Google Authenticator /
    1Password / Authy; comes with ten single-use backup codes. The secret is
    stored encrypted (AES-256-GCM) under `APP_SECRET`, so rotating `APP_SECRET`
    invalidates every enrolled authenticator (users simply re-enrol).
  - **Email codes** — a 6-digit code emailed at sign-in (10-minute expiry, max 5
    attempts, resend available). Needs no device, so a Super Admin can turn it on
    for a user from **Users** (the user is notified by email).
  A Super Admin can **require** 2FA for everyone from **Security** — admins
  without any method are then forced to set one up before using the dashboard —
  and can turn off a locked-out colleague's 2FA from **Users**. Sign-in is
  two-step: password, then a code (authenticator, emailed, or backup), with a
  short-lived signed challenge in between (no session until the code checks out).
- Sessions: random token in an httpOnly, SameSite=Lax cookie; only its SHA-256
  is stored. Changing your password signs out other devices; **Profile** lists
  active sessions and can sign out all others.
- New-device sign-in: the account owner is emailed when their account is used
  from a device/IP not seen before (toggle in **Security**).
- CSRF: state-changing requests must come from the site's own origin.
- Rate limits on sign-in, the 2FA step, password reset, the public forms and
  uploads.
- Security headers (all responses): a strict, per-request **nonce-based
  Content-Security-Policy** on every public page (only first-party and listed
  scripts run — the main XSS defence), a locked-down CSP on `/admin`
  (`frame-ancestors 'none'`), **HSTS** (1 year, includeSubDomains, on https),
  **Permissions-Policy** (camera/mic/geolocation/etc. disabled),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, and `X-Frame-Options: SAMEORIGIN`. The CSP
  can be relaxed, run report-only, or extended with extra trusted sources from
  **Security** if a custom snippet or embed needs it. Note: inline `on*` event
  handlers in Code Snippets will not run under the strict policy — use
  `addEventListener`.
- All input is validated with zod; rich text is sanitised to an allow-list
  (embeds only from YouTube and Vimeo); custom scripts must load over https.
- Uploads: type checked from file content (not the extension), SVGs with
  scripts rejected, EXIF/location data stripped, files served with a sandboxing
  CSP. A file still used on the site cannot be deleted until those references
  are replaced or removed (the media screen lists where it is used).
- Forms: honeypot, minimum fill time, link-count spam check, optional
  reCAPTCHA; CSV exports are protected against spreadsheet formula injection.
- Dependencies: `pnpm audit --prod` reports **no** known vulnerabilities in what
  ships to production (patched versions of `mariadb`, `mysql2`, `source-map-js`,
  `deepmerge-ts`, `fast-uri` are pinned via `pnpm.overrides` in the root
  `package.json`). Remaining advisories are in dev/build-only tooling (esbuild
  dev server, build-time parsers) and do not run in the production process.
- Tests: `pnpm --filter @workspace/cms-api test` runs the unit suite for the
  security primitives (TOTP, secret sealing, CSP builder).

## Deploying (not done yet)

> Nothing in this CMS has been deployed. The live site at veyra4retail.com is
> unchanged and **must not be updated without the owner's explicit approval.**

When approved, the outline for the current server (CloudPanel's Node site
proxying to `127.0.0.1:3000`):

1. In CloudPanel, **Databases → Add Database**: create a database (e.g.
   `veyra_cms`) with its own user and a strong password. CloudPanel's own MySQL
   (or MariaDB) is used as is; nothing extra to install.
2. Upload the workspace (without `node_modules`, `.env`, `.tools`, `uploads`),
   then `pnpm install --frozen-lockfile` and `pnpm build:cms`.
3. Create `artifacts/cms-api/.env` with a new `APP_SECRET`,
   `DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/veyra_cms?allowPublicKeyRetrieval=true`,
   `PUBLIC_SITE_URL=https://veyra4retail.com`, `PORT=3000`,
   `SITE_DIST=../veyra-site/dist/public`, `ADMIN_DIST=../cms-admin/dist` and
   SMTP details.
4. `pnpm --filter @workspace/cms-api db:deploy`, then `db:seed`.
5. Run `node --env-file=.env dist/index.mjs` from `artifacts/cms-api` in place
   of the current static server (update the watchdog cron to match).
6. Keep `uploads/` in the backup plan; CloudPanel can back up the database.
