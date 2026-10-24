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
| Images | **sharp** | Resizing, thumbnails, EXIF orientation | — |
| FIT parsing (phase 2) | **`@garmin/fitsdk`** | Garmin's official JavaScript FIT SDK on npm, decode only (**Verified 2026-10-24**) | fit-file-parser |
| Scheduled jobs | In-process scheduler (e.g. croner) started from Next.js `instrumentation.ts` | Reminders (phase 1.5) and Garmin sync (phase 2) need no queue | System cron calling a protected route |
| Authentication | **Better Auth** (email + password, Drizzle adapter, SQLite) | Supports several users from day one; roles, invitations, organisations and passkeys can be switched on later without a rewrite (D-25). Plugin availability to confirm at scaffold time | Auth.js; a hand-rolled single password (simplest, but a rewrite once there are several users) |
| Tests | **Vitest** for the wear and rule engine, **Playwright** for 2–3 key flows | Counters are the logic that must not be wrong | — |
| Runtime image | Node.js LTS on a Debian `slim` base | `better-sqlite3` and `sharp` ship prebuilt glibc binaries | Alpine (musl): possible, more friction |

Versions are not fixed here on purpose: take the current stable releases when the project starts.

### Application structure

```text
src/
├── app/                   # Next.js App Router
│   ├── page.tsx           # "To plan" dashboard
│   ├── bikes/[id]/        # Bike page: counters, components, timeline
│   ├── rides/             # List + quick add
│   ├── maintenance/       # Maintenance events
│   ├── plan/              # Rules and tasks
│   ├── settings/
│   ├── login/
│   └── api/
│       ├── uploads/       # Route Handler streaming files to disk
│       └── healthz/       # Health check for Docker and monitoring
├── server/                # Server-only code (`import "server-only"`)
│   ├── db/                # Drizzle schema, migrations, seed (component types, rule templates)
│   ├── domain/            # Pure functions: wear counters, rule status, ETA (unit-tested)
│   ├── actions/           # Server Actions (forms)
│   ├── files/             # Upload storage, sharp, content-type checks
│   ├── auth/              # Better Auth setup, current user and workspace
│   ├── jobs/              # Scheduler: reminders (1.5), Garmin sync (2)
│   └── integrations/      # garmin/ (phase 2)
├── components/            # UI components (shadcn/ui in components/ui)
└── instrumentation.ts     # Starts the scheduler on the Node runtime
```

## Running it

### Container image

- Multi-stage Dockerfile: build with pnpm, keep production dependencies only, run as uid 1000,
  `HEALTHCHECK` on `/api/healthz`, writable data only under `/data`.
- Built by GitHub Actions on each tag and published as a public image on GHCR
  (`ghcr.io/<owner>/bike-book:<version>`, lowercase). Deployments should pin a version.
- Database migrations run when the container starts. Back up `/data` before upgrading.

### Configuration

Everything is configured through environment variables; nothing installation-specific is
baked into the image or the repository.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATA_DIR` | No (default `/data`) | Where the database and files live |
| `TZ` | Recommended | Display timezone (e.g. `Europe/Paris`) |
| `AUTH_SECRET` | Yes | Signs session cookies (the first user and workspace are created on a setup screen at first launch) |
| `ALLOW_SIGNUP` | No (default `false`) | Self sign-up stays off; later, new users come by invitation |
| `PUBLIC_URL` | Recommended | Origin users type, e.g. `http://bikes.lan`; used for links and the Server Actions origin check |
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

- **Upload size.** Server Actions cap the request body (1 MB by default in the versions known so far,
  **Unverified** for the version that will be used). Photos and PDFs therefore go through a
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
- Derived files go to `cache/` and can be regenerated, so backups can skip them.

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
- **Built-in export (MVP):** one ZIP with every table as CSV/JSON plus the uploads. A portable
  copy you can keep anywhere, and a safety net for mistakes noticed late.
- **History matters more than frequency:** a deletion noticed a week later needs a backup from
  before it. Keep at least a few weeks of history if you can.
- **Test a restore** once before entering real data.

## Security

- Built for one user, or a small team, on a private network (D-09). Not hardened for direct exposure to the
  Internet; reach it through a VPN or a reverse proxy you control.
- Still behind a login: other devices share most networks.
- Password hashing, sessions and rate-limited login handled by the auth library; session
  cookie `HttpOnly` and `SameSite=Lax`; sessions expire (e.g. after 30 days).
- **Every query is scoped** by the current user and workspace in the data-access layer
  (`src/server/db`); pages and actions never query tables directly (D-25).
- Uploads: size limit, type checked from the file content (magic bytes), random file names,
  stored outside any static folder, served with `X-Content-Type-Options: nosniff`.
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
4. **iPhone photos in HEIC.** sharp's prebuilt binaries may not decode HEIC, and Safari on iOS
   usually converts photos to JPEG on upload (both **Unverified**). Test with a real iPhone
   photo early.
5. **Garmin key expiry (phase 2).** The Personal API key lasts one year at most: the app shows
   its expiry date and warns 30 days before.
6. **Docker inside Proxmox LXC containers**, a common self-hosting setup: a November 2025
   containerd/runc security update broke it (AppArmor), reported fixed in Proxmox VE 9.1.x
   (**Secondary**). Keep the host updated and test after upgrades.

## Local development

- `pnpm dev`, with the SQLite file in `./data/` (git-ignored) and a seed script that creates
  fictitious bikes and rides.
- `docker compose up` to test the production image with the same variables.

## Sources (accessed 2026-10-24)

- [SQLite — SQLite over a network](https://www.sqlite.org/useovernet.html)
- [garmin/fit-javascript-sdk](https://github.com/garmin/fit-javascript-sdk)
- [Proxmox forum — CVE-2025-52881 breaks Docker LXC containers](https://forum.proxmox.com/threads/cve-2025-52881-breaks-docker-lxc-containers.175827/)
