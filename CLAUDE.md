# Bike-Book — Claude Code context

Self-hosted web app to track bikes: rides, maintenance, components, and what is coming up
(services due by hours, kilometres or date, parts to order).

**Status:** design done (see `docs/`), code not started. Next step: Phase 0 — Foundations
(`docs/05-roadmap.md`).

## Read first

| File | When |
|------|------|
| `docs/02-decisions-and-questions.md` | Before any design choice: decisions D-xx are binding |
| `docs/03-data-model.md` | Before touching the schema or the wear/rule logic |
| `docs/04-architecture.md` | Stack, structure, configuration, security, pitfalls |
| `docs/05-roadmap.md` | What to build next, and the exit criteria |
| `docs/06-integrations.md` | Before any Garmin/Strava/Komoot/Bosch work (re-check sources: this moves fast) |
| `docs/07-ai.md` | Phase 3 only |

## Key decisions (summary — the docs win if they differ)

- **Stack:** Next.js (App Router, TypeScript strict, `output: "standalone"`), SQLite in WAL mode
  via `better-sqlite3`, Drizzle ORM + drizzle-kit, Tailwind + shadcn/ui, Zod, Vitest,
  Playwright. Package manager: pnpm.
- **Auth:** Better Auth. Multi-user-ready from day one (D-25): `users`, `workspaces`,
  `memberships`; one user and one workspace created by a first-launch setup screen; sign-up off.
- **Data:** all state in one directory (`DATA_DIR`, default `/data`): `bikebook.db`, `uploads/`,
  `cache/` (regenerable). Local filesystem only, never NFS/SMB.
- **Packaging:** one Docker image, non-root (uid 1000), read-only root filesystem, configured
  only through environment variables.
- **Wear rule (D-13):** on lift-assisted rides, wear time = descent time if set, else moving
  time, else total time. Same logic for distance.
- **UI language:** French (H-01). Code, comments, commit messages and docs: English.

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

## Target structure

```text
src/
├── app/            # App Router pages; api/uploads, api/healthz
├── server/         # server-only: db/ (schema, migrations, seed, data access), domain/,
│                   # actions/, files/, auth/, jobs/, integrations/
├── components/     # UI (shadcn/ui in components/ui)
└── instrumentation.ts  # starts the in-process scheduler
```

## Commands

Not defined yet: fill this section in when the project is scaffolded (dev, build, test, lint,
db migrate/seed, Docker build).
