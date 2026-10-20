# Veyra website download

This ZIP contains the current website source, all public media (MP4, WebM and posters), supporting workspace packages, the updated handoff report and verification captures. Unrelated API-server and mockup-sandbox artifacts, uploaded design-reference files, secrets, dependencies and build/cache files are excluded.

The original pnpm workspace layout is preserved because the project uses workspace and catalog dependencies.

## CMS (content management)

The site's content is now editable from a dashboard at `/admin`. Start the whole
stack (database, API, website, dashboard) with:

```sh
pnpm install
pnpm dev:cms
```

First-time setup (database, migrations, first admin account), roles, every
command, environment variables and deployment notes are in
[artifacts/cms-api/README.md](artifacts/cms-api/README.md).

The website still runs on its own without the CMS (below): it falls back to the
content bundled with it.

## Run locally (website only)

Install Node.js 22.12 or newer and pnpm, then extract this archive and open a terminal in the veyra-website folder:

```sh
pnpm install
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/veyra-site run dev
```

Open http://localhost:3000/ . The current marketing website does not require a backend or secrets.

On Windows PowerShell, set the variables before the pnpm command:

```powershell
$env:PORT="3000"
$env:BASE_PATH="/"
pnpm --filter @workspace/veyra-site run dev
```

## Build / preview

```sh
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/veyra-site run build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/veyra-site run serve
```

The static build is generated in artifacts/veyra-site/dist/public. Serve that folder over HTTP rather than opening index.html directly.

See artifacts/veyra-site/HANDOFF.md for verification results, approval-dependent content and verification limits. Stack-state images are in artifacts/veyra-site/verification.
