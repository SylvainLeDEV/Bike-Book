# Bike-Book — Claude Code context

Self-hosted web app to track bikes: rides, maintenance, components, and what is coming up
(services due by hours, kilometres or date, parts to rebuy from the workshop).

**Status:** Phase 1 step B in progress: features 1 to 9, 11 and 12 (bikes, reference data,
components, rides, maintenance, rule engine, tasks, workshop, dashboard, bike page, ZIP export)
done on 2026-10-26; feature 10 (attachments) is next, after an iPhone test with the owner.
Phase 0 items still open are deployment-side (backups with a tested restore, a 10 MB upload
through the proxy), planned before real data.

## Read first

| File | When |
|------|------|
| `docs/02-decisions-and-questions.md` | Before any design choice: decisions D-xx are binding |
| `docs/03-data-model.md` | Before touching the schema or the wear/rule logic |
| `docs/04-architecture.md` | Stack, structure, configuration, security, pitfalls |
| `docs/05-roadmap.md` | What to build next, and the exit criteria |
| `docs/06-integrations.md` | Before any Garmin/Strava/Komoot/Bosch work (re-check sources: this moves fast) |
| `docs/07-ai.md` | Phase 3 only |
| `docs/design/` | Before any UI work: design direction (`README.md`) and the HTML mockups, with their own working rules (`CLAUDE.md`) |
| `node_modules/next/dist/docs/` | Next.js docs for the installed version (see `AGENTS.md`): read before using a Next.js API |

## Key decisions (summary — the docs win if they differ)

- **Stack:** Next.js (App Router, TypeScript strict, `output: "standalone"`), SQLite in WAL mode
  via `better-sqlite3`, Drizzle ORM + drizzle-kit, Tailwind + shadcn/ui, Zod, Vitest,
  Playwright. Package manager: pnpm.
- **Auth:** Better Auth. Multi-user-ready from day one (D-25): `users`, `workspaces`,
  `memberships`; one user and one workspace created by a first-launch setup screen; sign-up off
  (`ALLOW_SIGNUP`, D-27). Sign-in goes through the Better Auth client (rate-limited endpoint);
  account creation and sign-out are Server Actions.
- **Data:** all state in one directory (`DATA_DIR`: `./data` by default, `/data` in the image):
  `bikebook.db`, `uploads/`, `cache/` (regenerable). Local filesystem only, never NFS/SMB.
  Migrations run automatically when the app opens the database (D-28).
- **Packaging:** one Docker image, non-root (uid 1000), read-only root filesystem, configured
  only through environment variables.
- **Wear rule (D-13):** on lift-assisted rides, wear time = descent time if set, else moving
  time, else total time. Same logic for distance.
- **UI language:** French (H-01). Code, comments, commit messages and docs: English.
- **Design and phase 1 scope** decided on 2026-10-25 (D-30 to D-48): light and dark themes,
  workshop (parts and restocking) instead of "parts to order", bike record with total cost per
  100 km. Phase 1.5: labels, products and tools, maintenance procedures.
- **Data readable by an AI (D-50):** names carry their unit, enums defined in 03, inputs
  validated, derived values computed, `docs/03-data-model.md` kept as the data dictionary.
- **Step B working rules (D-54):** build screens directly in the app (no `/design` detour when
  the mockup covers them); the owner commits and pushes; never `git add`/`commit`/`push`/`tag`.

## Rules

1. **This repository is public (D-22).** Never commit secrets, real personal data, `.env`
   files, or anything about a specific installation (IPs, hostnames, VMIDs, backup targets,
   VPN details). Deployment details for a given homelab live in that homelab's own repository.
   Seed and test data are fictitious.
2. **Scoped data access.** Pages, Server Actions and Route Handlers never query tables
   directly. They go through the data-access layer in `src/server/db`, which receives the
   current user and workspace and filters by them (D-25).
3. **Domain logic is pure and tested.** Wear counters, rule status and ETA live in
   `src/server/domain` as pure functions with Vitest tests. Change the tests with the logic.
4. **Conventions (data model):** distances in metres, durations in seconds, money in euro cents
   (integers); instants in UTC, displayed in `TZ`; calendar dates as `YYYY-MM-DD`; enums as text
   with CHECK constraints. Avoid SQLite-only SQL so PostgreSQL stays possible.
5. **Uploads** (photos, PDFs, FIT files) go through a streaming Route Handler
   (`app/api/uploads`), not Server Actions (body size limit). Check the type from the content,
   use random file names, store originals in `uploads/` and derived files in `cache/`.
6. **Labels in docs:** Decided / Proposed / Assumption / Estimate / Verified (date) / Secondary
   / Unverified. Never present an unverified fact as verified.
7. **Keep docs current.** A new or changed decision goes into
   `docs/02-decisions-and-questions.md` (dated), and the affected doc is updated in the same
   change.
8. Pragmatic, no over-engineering: build only what the current roadmap phase needs, but do not
   close the doors listed in the decisions (multi-user, PostgreSQL, Garmin sync).

## Structure

```text
src/
├── app/            # App Router: (app)/ signed-in pages, (auth)/ login + setup,
│                   # design/ (development-only design system, D-32),
│                   # api/auth/[...all] (Better Auth), api/healthz, api/export (ZIP, D-68);
│                   # api/uploads with feature 10.
│                   # Routes: /, /bikes, /bikes/[bikeId], /activity, /workshop (D-54), /settings;
│                   # /bikes/[id]?done=<rule> and ?replace=<item> open a sheet on arrival
│                   # globals.css = the design tokens (D-30, D-31)
├── server/         # server-only
│   ├── db/         # schema, migrations/, seed, data-access layer (index.ts = public API)
│   ├── auth/       # Better Auth instance, sign-up policy, current user + workspace
│   ├── actions/    # Server Actions, their Zod input schemas in *-input.ts
│   ├── domain/     # pure, tested logic: bike status, total cost, wear (D-13), part history,
│   │               # instants of dated entries (D-61), rule engine (D-65)
│   ├── views/      # view models of the real pages (data-access layer + domain)
│   ├── export/     # ZIP writer (node:zlib), CSV, dictionary.json from schema + docs/03 (D-68)
│   ├── env.ts      # configuration, validated with Zod (TZ included); time.ts: today in TZ
│   └── (files/, jobs/, integrations/ come with features 10, 1.5 and phase 2)
├── components/     # Screens and building blocks, fed by view models (props);
│                   # primitives in components/ui (shadcn/ui style, Radix), shell/ = app shell
├── lib/            # client-safe: enums.ts (enum values, shared with the schema),
│                   # format.ts / parse.ts (French formats), labels.ts (enum labels), names.ts,
│                   # view-models.ts, display.ts, theme.ts, auth client
├── test/           # Vitest setup
└── instrumentation.ts  # opens the database (migrations) at startup; scheduler later
scripts/            # db-migrate.ts, db-seed.ts (run with tsx)
```

- Only `src/server/db` imports the Drizzle client, the schema, `drizzle-orm` or
  `better-sqlite3`. ESLint enforces it (`no-restricted-imports`); tests are exempt.
- Code under `src/server` imports `server-only`. Scripts run with `tsx --conditions=react-server`
  and Vitest aliases `server-only` to an empty module.
- UI: tokens only (Tailwind colours are reset to them), Tailwind breakpoints `md` = 700 px and
  `lg` = 1024 px, `pointer-coarse:` for 44 px touch targets, French formats through
  `src/lib/format.ts`. Screens take view models with raw units and `YYYY-MM-DD` dates; `/design`
  shows them with fixtures (`pnpm dev`, then http://localhost:3000/design).

## Commands

Toolchain: Node.js ≥ 24 (the image uses Node 24 LTS) and pnpm 12 (pinned in `packageManager`).

| Command | What it does |
|---------|--------------|
| `pnpm install` | Install dependencies (build scripts are denied by default, see `pnpm-workspace.yaml`) |
| `pnpm dev` | Dev server on http://localhost:3000, database in `./data` (works without a `.env`) |
| `pnpm build` / `pnpm start` | Production build (`.next/standalone`) / run it |
| `pnpm lint` | ESLint (Next.js rules + data-access import restriction) |
| `pnpm format` / `pnpm format:check` | Prettier (Markdown files are left alone) |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest; each test file gets its own temporary database |
| `pnpm db:generate` | Generate a migration from `src/server/db/schema.ts` (drizzle-kit) |
| `pnpm db:migrate` | Apply migrations to `DATA_DIR` (the app also does it at startup) |
| `pnpm db:seed` | Create the fictitious demo account and garage of `/design` (`demo@example.com`, see `src/server/db/seed.ts`), dates moved to the current week; `--reset` recreates it; refuses to run in production |
| `pnpm db:studio` | Drizzle Studio on the dev database |
| `docker compose up --build` | Build and run the production image locally (needs `.env`, see `docker-compose.yml`) |

Releases: push a `v*` tag; GitHub Actions runs the checks, then builds and pushes
`ghcr.io/<owner>/bike-book:<version>` (linux/amd64).
