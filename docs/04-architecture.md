# Architecture

Status: stack and runtime model **Decided** on 2026-10-24 (D-10, D-11); the rest is
**Proposed**. Constraints: one user to start with, multi-user-ready (D-01, D-25), responsive web (D-02), one Docker image (D-03),
private-network deployment (D-09).

This document describes the application and how to run it on **any Docker host**. It contains
nothing specific to a particular installation: hosting details (host, network, backup target)
belong to whoever deploys it.

## Overview

```text
 Browser (PC, tablet, phone) ── private network or VPN
        │  http(s)://<your-hostname>
        ▼
 Reverse proxy (optional: Nginx, Caddy, Traefik, NPM…)
        ▼
 Container bike-book (Next.js on Node) :3000
        └─ /data  (one volume, local filesystem)
             ├─ bikebook.db    SQLite, WAL mode
             ├─ uploads/       photos, PDFs, FIT files (originals)
             └─ cache/         thumbnails, resized copies (regenerable)
```

One process serves pages, forms and the API. All state lives in one directory: back it up and
you have backed up everything.

## Stack

| Layer | Choice | Why | Alternatives considered |
|-------|--------|-----|-------------------------|
| Framework | **Next.js** (App Router, TypeScript, `output: "standalone"`), **Decided** (D-10) | The safest long-term choice: React is the market standard, its UI ecosystem is the richest (components, animation, charts, maps, drag and drop), and a React Native app stays possible later (Apple Health needs native iOS). One process for UI and server; Server Actions handle forms. Cost: more concepts to learn (Server/Client Components, caching) | **SvelteKit**: simpler, less code, smaller ecosystem. **Nuxt** (Vue). **API + separate SPA**: two codebases, overkill here |
| Database | **SQLite** in WAL mode (`better-sqlite3` driver) | Few users and few writes: no database server to run, upgrade or back up separately. One file, very fast | **PostgreSQL** pays off with many concurrent writers (a hosted service with many shops) or PostGIS. Not needed for one rider or one shop; migrating later stays possible through Drizzle |
| ORM and migrations | **Drizzle ORM** + drizzle-kit | Schema written in TypeScript, types flow up to the UI, close to SQL, versioned migrations | Prisma (heavier), Kysely (query builder only) |
| Validation and forms | **Zod** + React Hook Form | The same schemas validate forms and Server Actions | Valibot, Conform |
| UI | **Tailwind CSS** + **shadcn/ui** (Radix) | Accessible components, responsive by default, easy dark mode | Skeleton, DaisyUI |
| Charts and motion | Recharts (shadcn/ui charts), Motion | Statistics per bike and per month, polished transitions | Apache ECharts, Tremor |
| Images | **sharp**, installed with feature 10 | Resizing, thumbnails, EXIF orientation, copies without metadata (D-72). Prebuilt binaries for linux/amd64 (glibc) come as an optional dependency, installed by `pnpm install` inside the image build | — |
| FIT parsing (phase 2) | **`@garmin/fitsdk`** | Garmin's official JavaScript FIT SDK on npm, decode only (**Verified 2026-10-24**) | fit-file-parser |
| Scheduled jobs | In-process scheduler (e.g. croner) started from Next.js `instrumentation.ts` | Reminders (phase 1.5) and Garmin sync (phase 2) need no queue | System cron calling a protected route |
| Authentication | **Better Auth** (email + password, Drizzle adapter, SQLite) | Supports several users from day one; roles, invitations, organisations and passkeys can be switched on later without a rewrite (D-25). Plugin availability to confirm at scaffold time | Auth.js; a hand-rolled single password (simplest, but a rewrite once there are several users) |
| Tests | **Vitest** for the wear and rule engine, **Playwright** for 2–3 key flows | Counters are the logic that must not be wrong | — |
| Runtime image | Node.js LTS on a Debian `slim` base | `better-sqlite3` and `sharp` ship prebuilt glibc binaries | Alpine (musl): possible, more friction |

Versions are not fixed here on purpose: the versions picked at scaffold time, and why, are in
D-29 (`package.json` and `pnpm-lock.yaml` are the source of truth). React Hook Form, Recharts,
Motion and Playwright are not installed yet: each one comes with the feature that needs it, once
approved (sharp came with feature 10). The step A forms use React state and native validation attributes; the
Server Actions validate with Zod.

### Application structure

The actual tree (the first draft, before the scaffold, used `app/bikes`, `app/plan`…; the
routes of phase 1 step B are listed in [Routes](#routes)).

```text
src/
├── app/                   # Next.js App Router
│   ├── layout.tsx         # Fonts (next/font), theme cookie → <html data-theme> (D-52)
│   ├── globals.css        # Design tokens (D-30, D-31), Tailwind theme, base styles
│   ├── not-found.tsx      # French 404 page
│   ├── (auth)/            # /login, /setup (first launch)
│   ├── (app)/             # Signed-in pages (step B moves them into the app shell)
│   ├── design/            # Development-only design system (D-32): 404 in production
│   └── api/
│       ├── auth/[...all]/ # Better Auth endpoints
│       ├── healthz/       # Health check for Docker and monitoring
│       ├── export/        # The ZIP export (feature 12, D-68), attachments' files included
│       └── uploads/       # POST streams one file to disk; [id]/ serves it (feature 10)
├── components/            # Screens and building blocks, data received as view models (props)
│   ├── ui/                # Primitives (shadcn/ui style, Radix): button, field, chip, sheet, toast…
│   ├── shell/             # App shell: sidebar / rail / bottom bar, top bar, theme, account
│   ├── dashboard/ bike/ workshop/ rides/ plan/ photos/
│   ├── attachments/       # "Pièces jointes" block, upload rows, editor, service context
│   └── …                  # Shared: wear bar and badges, timeline, bike cover, empty state
├── lib/                   # Client-safe: enum values (enums.ts), French formatting and parsing,
│                          # enum labels, name comparison, view-model types, theme
├── server/                # Server-only code (`import "server-only"`)
│   ├── db/                # Drizzle schema, migrations, seed, scoped data-access layer
│   ├── auth/              # Better Auth setup, current user and workspace
│   ├── actions/           # Server Actions (forms) and their Zod input schemas (*-input.ts)
│   ├── domain/            # Pure, tested logic: bike status, total cost, (wear, rules, stock…)
│   ├── views/             # View models of the real pages, from the data-access layer + domain
│   ├── export/            # ZIP writer, CSV, data dictionary for the export (D-68)
│   ├── files/             # Uploads on disk: streaming, atomic rename, sharp copies (feature 10)
│   ├── theme.ts           # Reads the theme cookie
│   ├── time.ts            # "Today" in the configured TZ
│   ├── startup.ts         # Server start: configuration, database (migrations); exit on failure
│   └── env.ts             # Configuration, validated with Zod
│   # Later: jobs/ (1.5), integrations/ (2)
└── instrumentation.ts     # Runs server/startup.ts at startup; scheduler later
```

### Design system (phase 1 step A)

- **Tokens** are the validated mockup's CSS variables, unchanged, in `src/app/globals.css`: the
  light theme in `:root`, the dark theme twice (system setting, explicit choice). Tailwind's
  colours are reset to these tokens only (`bg-surface`, `text-fg-muted`, `bg-brand-soft`…), and the
  shadcn/ui variables (`--primary`, `--background`…) point to them. No literal colour in a
  component, except the bike cover and simulated photo illustrations.
- **Theme (D-31, D-52):** a `theme` cookie per device (`system`, `light`, `dark`); the root layout
  sets `data-theme` on `<html>`, so the first byte has the right theme. Tailwind's `dark:` variant
  follows the same rule.
- **Layout:** media queries with the mockup's thresholds as Tailwind breakpoints: `md` = 700 px
  (icon rail), `lg` = 1024 px (full sidebar, two-column bike page, workshop list and item side
  by side). Touch targets grow to 44 px with `pointer-coarse:`; inputs use 16 px text.
- **Fonts:** Geist (interface) and Barlow Semi Condensed 500/600/700 (figures, `num` utility),
  both through `next/font`, downloaded at build time.
- **Primitives:** Radix (already in `radix-ui`) for the sheet (bottom sheet under 700 px, dialog
  above), toast, tabs, menu and popover: focus trap, Escape, focus return and announcements
  come with them.
- **View models** (`src/lib/view-models.ts`) carry raw values in the data's units (metres,
  seconds, cents, `YYYY-MM-DD` dates already converted to `TZ` on the server); formatting is
  done by `src/lib/format.ts` (French, written by hand so server and browsers print the same
  characters) and `src/lib/display.ts`, both tested.
- **`/design`** renders the real screens with fictitious fixtures (`src/app/design/fixtures.ts`)
  and demo actions (toasts with "Annuler"); it answers 404 when `NODE_ENV=production`.

### Routes

Status: **Decided** (D-54, 2026-10-26). URLs in English, like the folder names they come from
(code in English, H-01); every visible label stays French. Until its feature is built, a route
of the navigation shows a "Bientôt ici" page rather than a 404.

| URL | Screen | Notes |
|-----|--------|-------|
| `/` | Accueil | "À prévoir", "À racheter", bikes, latest activity |
| `/bikes` | Vélos | Active bikes as cards; stored, sold, stolen and retired bikes folded; "Ajouter un vélo" (sheet) |
| `/bikes/[bikeId]` | Page vélo | `?tab=` selects the tab below 1024 px (deep links from the viewer); `?done=<rule>`, `?replace=<item>` and `?event=<maintenance event>` (D-70) open a sheet on arrival |
| `/activity` | Activité | Rides, maintenance and done tasks log (features 4, 5 and 7; D-77) |
| `/workshop` | Atelier | `?tab=rebuy`, `?bike=`, `?q=` keep the filters in the URL |
| `/workshop/[itemId]` | Fiche d'un objet | Under 1024 px it replaces the list; from 1024 px the list stays beside it |
| `/settings` | Réglages | Account and sign-out, theme of this device, "Exporter mes données" (feature 12, D-68) |
| `/login`, `/setup` | Connexion, premier lancement | Unchanged |
| `/api/uploads`, `/api/uploads/[id]` | Pièces jointes | `POST /api/uploads?owner=<kind>&id=<n>&lastModified=<ms>[&cover=1]`: the raw file as body, its name in `X-File-Name` (URI-encoded), 201 `{ id }` or an error `{ error, message }` (401, 404, 413, 415). `GET /api/uploads/<id>[?size=thumb\|display][&download=1]`: signed in, scoped, `nosniff`, private cache revalidated by ETag (D-76) |
| `/api/export` | Export ZIP | Current workspace only, auth tables never included; 401 when signed out (D-68) |
| `/design` | Design system | Development only |

Quick ride entry, maintenance entry, "Remplacer une pièce" and the edit sheets are sheets, not
routes: they open from any screen and keep it underneath.

## Running it

### Container image

- Multi-stage Dockerfile: build with pnpm, keep production dependencies only, run as uid 1000,
  `HEALTHCHECK` on `/api/healthz`, writable data only under `/data`.
- Built by GitHub Actions on each tag and published as a public image on GHCR
  (`ghcr.io/<owner>/bike-book:<version>`, lowercase). Deployments should pin a version.
- Database migrations run when the container starts (the app applies them when it opens the
  database, D-28), with foreign keys off, then checked (D-69). Back up `/data` before upgrading:
  a migration that breaks a reference stops the app, and the way back is that backup.
- Image built for `linux/amd64` only for now; `linux/arm64` can be added to the release
  workflow if needed.

### Configuration

Everything is configured through environment variables; nothing installation-specific is
baked into the image or the repository.

The configuration is checked when the server starts. In production, a missing or invalid value,
an unwritable `DATA_DIR` or a failed migration stops the process with exit code 1 and the reason
in the logs (D-28): the container exits instead of answering HTTP 500.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATA_DIR` | No (default `./data`; the image sets `/data`) | Where the database and files live |
| `TZ` | Recommended | Display timezone (e.g. `Europe/Paris`): instants are shown and "today" is computed in it. An unknown zone stops the app at startup; without `TZ`, the process zone is used (UTC in most containers) (D-57) |
| `AUTH_SECRET` | Yes in production (D-28) | Signs session cookies. At least 32 characters (`openssl rand -base64 32`); the `.env.example` placeholder is refused. Development uses a built-in insecure default |
| `ALLOW_SIGNUP` | No (default `false`) | `false`: only the first-launch setup screen creates an account. `true`: anyone who reaches the app can create an account with its own workspace (D-27). Later, new users come by invitation |
| `PUBLIC_URL` | Yes in production (D-28) | Origin users type, e.g. `http://bikes.lan`. Better Auth's base URL: origin check on sign-in, and session cookies get `Secure` only when it starts with `https://`. Open the app at exactly this origin, or sign-in is refused |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | No | Phase 1.5 notifications (D-18) |
| `ICS_FEED_TOKEN` | No | Secret part of the calendar feed URL (D-18) |
| `GARMIN_PERSONAL_API_KEY` | No | Phase 2 sync (D-14) |

### Example compose file

```yaml
services:
  app:
    image: ghcr.io/<owner>/bike-book:0.1.0 # pin a version
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file: .env # secrets, mode 0600, never committed
    environment:
      TZ: Europe/Paris
    volumes:
      - ./data:/data # a LOCAL directory, not a network share
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
```

### Behind a reverse proxy

- **Upload size.** Server Actions cap the request body (1 MB by default, **Verified 2026-10-24**
  in the Next.js 16.4 docs). Photos and PDFs therefore go through a
  Route Handler (`app/api/uploads`) that streams to disk; Server Actions stay for forms. The
  proxy must also accept bodies of about 25 MB.
- **Origin check.** Server Actions reject requests whose `Origin` does not match the host. The
  proxy must forward the original `Host` header; otherwise add the public origin to the Server
  Actions allowed origins.
- **HTTPS.** Plain HTTP works on a trusted private network (D-15). Without a secure context the
  browser shows "Not secure" and there is no installable/offline PWA, no Web Push and no
  passkeys. Terminate TLS at the proxy if you want them.

## Data

**Decided (D-11):** all state in one data directory on a **local filesystem**.

- Never put the data directory on NFS or SMB: the official SQLite docs warn that locks can
  misbehave on network filesystems, which has led to corruption.
- Derived files go to `cache/` and can be regenerated, so backups can skip them: WebP copies of
  each photo under `cache/<storage path without extension>/` (D-76), made again on first
  request if the folder is deleted. Partial uploads live in `uploads/.tmp/`, emptied at start.

Volume (**Estimate**, based on H-03):

| Data | Assumption | Per year |
|------|------------|----------|
| Database | Text only | < 5 MB (< 50 MB after 10 years) |
| Photos, originals kept (D-20) | 300 photos × ~3 MB | ≈ 1 GB |
| Photos, resized copies | 300 × ~0.3 MB | ≈ 0.1 GB |
| PDF invoices | 30–50 × 0.2–1 MB | ≈ 10–50 MB |
| FIT files (phase 2) | 200 rides × 0.1–1 MB | ≈ 20–200 MB |

About 20 GB covers more than 10 years in the worst case.

## Backups

Backing up is the operator's job (D-12); the app makes it easy:

- **What to back up:** the data directory, except `cache/`.
- **Consistency:** copying the live `bikebook.db` with its `-wal` file can capture an
  inconsistent state. Either snapshot the whole volume (filesystem or VM/container snapshot:
  SQLite in WAL mode normally recovers from a crash-consistent copy), or make a consistent copy
  first with `sqlite3 bikebook.db ".backup copy.db"` (or `VACUUM INTO`) while the app runs.
- **Built-in export (MVP):** Réglages › "Exporter mes données": one ZIP with every table as CSV
  and JSON, the data dictionary (D-68) and the attachments' originals under `uploads/` (feature
  10; 4 GiB at most, pitfall 10). A portable,
  readable copy you can keep anywhere, and a safety net for mistakes noticed late. The app
  cannot import it back, so it complements the backup of the data directory, it does not
  replace it.
- **History matters more than frequency:** a deletion noticed a week later needs a backup from
  before it. Keep at least a few weeks of history if you can.
- **Test a restore** once before entering real data.

## Security

- Built for one user, or a small team, on a private network (D-09). Not hardened for direct exposure to the
  Internet; reach it through a VPN or a reverse proxy you control.
- Still behind a login: other devices share most networks.
- Password hashing (scrypt), sessions and rate-limited login handled by the auth library;
  session cookie `HttpOnly` and `SameSite=Lax`, sessions expire after 30 days (**Verified
  2026-10-24** on the container). Rate limiting keys on the client IP from `X-Forwarded-For`:
  a reverse proxy in front must overwrite that header, not append to what the client sent.
- **Every query is scoped** by the current user and workspace in the data-access layer
  (`src/server/db`); pages and actions never query tables directly (D-25).
- Uploads (feature 10, D-73 to D-76): one Route Handler streaming the raw body to disk, never a
  Server Action; the element is checked against the workspace before anything is written; size
  limit (25 MB) counted while the body streams, not read from `Content-Length`; type checked
  from the file content (magic bytes), never from the name or the browser's type; random file
  names; temporary file then atomic rename, removed on failure; stored under the data
  directory, outside any static folder. Accepted: JPEG, PNG, WebP and PDF; HEIC refused with its
  own message (D-73). Served signed in and scoped, with `X-Content-Type-Options: nosniff`, a
  `Content-Disposition` (inline, or `attachment` for downloads) and `Cache-Control: private,
  no-cache`. Pages show only the copies made by sharp, without metadata (D-72); the original,
  GPS included, is served only as an explicit download. PDFs open in the browser's own viewer:
  the files are the user's own, on a private network (D-09).
- Container: non-root user, read-only root filesystem, `no-new-privileges`.
- **Public repository (D-22):** no secrets, no real data, no installation details. `.gitignore`
  covers `data/`, `.env*` and uploads; seed data is fictitious; GitHub secret scanning and push
  protection enabled. Dependencies updated with Renovate or Dependabot.
- The Garmin key (phase 2) gives read access to health data: treat it like a password. It
  expires within a year anyway.

## Observability

- Logs as JSON lines on stdout, for any log collector.
- `/api/healthz` for the container health check and uptime monitoring.
- Optional later: a Prometheus `/metrics` endpoint (rule counts, last Garmin sync).

## Pitfalls

1. **SQLite on a network filesystem.** Never (see [Data](#data)).
2. **Next.js behind a proxy.** Origin check and body size (see
   [Behind a reverse proxy](#behind-a-reverse-proxy)): test a form and a 10 MB upload through
   the proxy before real use.
3. **Time.** Store UTC, display in the configured timezone: daylight-saving changes are where
   date bugs hide.
4. **iPhone photos in HEIC.** sharp's prebuilt binaries read JPEG, PNG, WebP, AVIF, TIFF, GIF
   and SVG, not HEIC (**Verified 2026-10-25** on sharp's install page). Tested on 2026-10-27
   (H-11, iOS 27): Safari sent JPEG whatever `accept` said, with the date taken, its UTC offset
   and the GPS position (D-72: kept in the original only); every photo had EXIF orientation 6,
   so the copies apply it (sharp's `rotate()`); camera captures from the picker carry no EXIF
   date (their `lastModified` is the upload time). A HEIC that arrives from a Mac or the Files
   app is therefore **refused** with a message saying how to get a JPEG (D-73), not decoded.
   A file named `.jpg` that is something else is refused too: only the content counts.
5. **Garmin key expiry (phase 2).** The Personal API key lasts one year at most: the app shows
   its expiry date and warns 30 days before.
6. **SQLite table rebuilds in migrations.** drizzle-kit changes a column by recreating the
   table and dropping the old one; with foreign keys on, the drop cascades and empties the child
   tables. `openDatabase` therefore migrates with foreign keys off and checks them afterwards
   (D-69, tested in `src/server/db/client.test.ts`). When writing a migration: never edit or
   delete one already released (drizzle compares dates, not content), prefer additive changes,
   and read any generated rebuild before committing it.
7. **Docker inside Proxmox LXC containers**, a common self-hosting setup: a November 2025
   containerd/runc security update broke it (AppArmor), reported fixed in Proxmox VE 9.1.x
   (**Secondary**). Keep the host updated and test after upgrades.
8. **drizzle-kit and `ALTER TABLE … ADD COLUMN … REFERENCES`.** drizzle-kit 0.31 writes the
   added column's `REFERENCES` without its `ON DELETE` clause, although the snapshot has it
   (**Verified 2026-10-27** on migration `0010_attachments`, fixed by hand before release). Read
   every generated `ALTER TABLE … ADD` with a foreign key; a test checks that deleting an
   attachment clears the covers through the key itself.
9. **A `proxy.ts` would cut uploads.** With a proxy (the former middleware), Next.js buffers each
   request body to clone it, up to `experimental.proxyClientMaxBodySize` (10 MB by default), and
   silently hands only that much to the Route Handler (**Verified 2026-10-27** in the Next.js
   16.4 docs). The app has no proxy; adding one means raising that limit above 25 MB or
   excluding `/api/uploads` from its matcher.
10. **ZIP export over 4 GiB.** The in-house ZIP writer has no ZIP64 (D-68). With originals of
    about 1 GB a year (D-20), an export of several years of photos can pass 4 GiB: the export
    then answers 413 with a French message before the first byte, and the data directory
    backup (D-12) is the way to copy everything. ZIP64 (or a library) is the fix when it
    happens.

## Local development

- `pnpm dev`, with the SQLite file in `./data/` (git-ignored) and a seed script (`pnpm db:seed`)
  that creates the fictitious data of `/design`, its dates moved to the current week (D-58);
  `pnpm db:seed --reset` recreates it.
- `docker compose up --build` to test the production image with the same variables
  (`docker-compose.yml` at the repository root; its database lives in `./data/compose`).
- All commands: see the Commands section of `CLAUDE.md`.

## Sources (accessed 2026-10-24)

- [SQLite — SQLite over a network](https://www.sqlite.org/useovernet.html)
- [garmin/fit-javascript-sdk](https://github.com/garmin/fit-javascript-sdk)
- [Proxmox forum — CVE-2025-52881 breaks Docker LXC containers](https://forum.proxmox.com/threads/cve-2025-52881-breaks-docker-lxc-containers.175827/)
