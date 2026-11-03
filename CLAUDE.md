# Bike-Book — Claude Code context

Self-hosted web app to track bikes: rides, maintenance, components, and what is coming up
(services due by hours, kilometres or date, parts to rebuy from the workshop).

**Status:** Phase 1 step B: features 1 to 12 done (bikes, reference data, components, rides,
maintenance, rule engine, tasks, workshop, dashboard and bike page on 2026-10-26; attachments,
feature 10, on 2026-10-27, D-73 to D-76; done tasks in the history, D-77, and the bike history's
own tab with filters, D-78, on 2026-10-28). Going live by D-89 (2026-11-02): deploy the release,
then the proxy checks (a form, 10 MB and 25 MB uploads) and a real-iPhone photo before any
entry, a little real data, the restore test on a separate copy, then the full entry; the phase 1
exit criteria come from real use. Phase 1.5 started on
2026-11-01 with the setup log, the bike page's "Réglages" tab (D-79 to D-84); the settings page
is now "Paramètres" (D-80); then the workshop's products and tools (D-85) and the maintenance
procedures ("fiches", D-86) and the runs ("suivi", D-87) on 2026-11-02, the three steps of D-82,
and the "Réparé" action (D-88). On 2026-11-03, an MCP server for an external assistant (D-90):
bikes and parts dictated to Claude Code, personal tokens in Paramètres; the same day, rides,
what is to do, the workshop and the procedures through it (D-92), then maintenance done (D-93),
restocking and edits (D-94), history and setups (D-95), usage and procedures (D-96), rides imported
in batches (D-97), runs and deletes for mistakes (D-98), photos and PDFs through upload
links (D-99).

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
- **Workshop (D-33, D-85):** parts (units), products (the open container's level and the
  containers) and tools (owned or not), all as movements; no movement kind was added
  (see the movements by kind in `docs/03-data-model.md`). No `/design` screen nor demo data for
  products and tools.
- **Procedures (D-86):** the Atelier's "Fiches" filter and the bike page's section; rules and
  tasks point to one from their own sheets; a PDF manual and the steps' photos are attachments;
  archived, or deleted for good.
- **Runs (D-87):** `/runs/[runId]`, one step at a time; the procedure's steps are copied at the
  start; status `in_progress` or `done` (abandoned = deleted); "Terminer" writes one event line,
  the parts and product levels used and the rule reset, in one transaction, with "Annuler";
  deleting that event deletes the run and gives the stock back.
- **MCP server (D-90):** `POST /api/mcp`, `@modelcontextprotocol/server` (SDK v2), stateless,
  JSON answers; a personal token (`bb_…`, SHA-256 in `api_tokens`, revocable), never the session.
  A thin layer: the forms' Zod schemas and the data-access layer, no business rule in a tool.
  Tools `verb_noun`, one file per domain plus a registry, raw units, `{ field, message }` errors in
  French, a required `dry_run` (a rolled-back transaction), paginated lists, one log line per
  write, never the frame number; deletes only to fix a mistake, as the app's sheets (D-98:
  rides, maintenance events, setups, an abandoned run; never a file removed by a dry run). V1: bikes and parts. A new part's rules can take the day each
  was last done (`rules[].last_done_on`, as the "Règles" sheet), so an old bike's day-based
  rules do not start overdue. Since 0.3.1 (D-91), `list_rules` and `add_rule` (the "Règles"
  sheet's schema and slots) add any rule to a bike or a fitted part type. Since D-92: rides
  (list, create, update, delete), `list_due_work` ("À prévoir" with each procedure's material
  read against the workshop), `add_task`, the workshop (`list_workshop_items`,
  `add_workshop_item`, `update_stock`) and the procedures (read-only). Since D-93:
  `record_maintenance` (lines with `rule_id` are "C'est fait"), `replace_component` (a part from
  the workshop's stock or typed), `set_task_done`. Since D-94: `set_restock`, `receive_item`,
  `update_workshop_item`, `update_task`, `update_rule`, `snooze_rule`. Since D-95:
  `list_maintenance`, `update_maintenance`, `list_setups`, `add_setup`, `archive_workshop_item`.
  Since D-96: `get_bike_usage` (parts' wear, total cost), `create_procedure`,
  `update_procedure`, `archive_procedure`. Since D-97: `create_rides` (an import, up to 500, one
  transaction) and `delete_rides` (its undo). Since D-98: runs (`start_run`, `get_run`,
  `update_run_steps`, `finish_run`, `abandon_run`), `delete_maintenance`, `update_setup`,
  `delete_setup`. Since D-99: `get_upload_link` (a signed link, 15 minutes, one element, in the
  `X-Upload-Link` header: the assistant sends files from the computer with curl, never through the
  MCP), `list_attachments`, `update_attachment`, `delete_attachment`.
- **Setup (D-79, D-81):** a fork's or shock's spring, travel and adjusters (clicks from fully
  closed) live on the part (`suspension_specs`); each setup is a dated full copy whose values belong
  to the part measured. Advice only from manufacturers' documents, each with its source and date.

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
│                   # api/auth/[...all] (Better Auth), api/healthz, api/export (ZIP, D-68),
│                   # api/uploads (POST, raw body streamed) and api/uploads/[id] (GET, D-76),
│                   # api/mcp (POST, the MCP server, personal token, D-90).
│                   # Routes: /, /bikes, /bikes/[bikeId], /activity, /workshop (D-54), /settings,
│                   # /runs/[runId] (a run, full screen, D-87);
│                   # /workshop?tab=, ?bike=, ?q=, ?item=, ?procedure= stay in the address
│                   # (D-85, D-86), ?new=1 opens "Nouvelle fiche";
│                   # /bikes/[id]?done=<rule>, ?replace=<item> and ?event=<id> (edit,
│                   # D-70) open a sheet on arrival; ?tab= (setup: "Réglages", D-79) and
│                   # the history's ?year=, ?month=, ?kind= stay in the address (D-78)
│                   # globals.css = the design tokens (D-30, D-31)
├── server/         # server-only
│   ├── db/         # schema, migrations/, seed, data-access layer (index.ts = public API),
│   │               # transactions.ts (atomically, previewWrite for dry runs, D-90)
│   ├── auth/       # Better Auth instance, sign-up policy, current user + workspace,
│   │               # personal tokens (tokens.ts: authenticateBearer, D-90),
│   │               # upload links (upload-links.ts, D-99)
│   ├── actions/    # Server Actions, their Zod input schemas in *-input.ts
│   ├── domain/     # pure, tested logic: bike status, total cost, wear (D-13), part history,
│   │               # instants of dated entries (D-61), rule engine (D-65), attachments
│   │               # (format from magic bytes, EXIF dates, storage paths, covers),
│   │               # what each setup changed (D-79)
│   ├── views/      # view models of the real pages (data-access layer + domain)
│   ├── export/     # ZIP writer (node:zlib), CSV, dictionary.json from schema + docs/03 (D-68),
│   │               # attachments' originals under uploads/
│   ├── files/      # uploads on disk: streaming to a temp file, atomic rename, sharp copies in
│   │               # cache/ (upright, no metadata), generated demo photos and PDFs (D-76)
│   ├── mcp/        # MCP server (D-90, D-92 to D-99): tools/ (bikes, components, rules,
│   │               # rides, maintenance, setups, usage, runs, attachments, todo, workshop,
│   │               # procedures: one file per domain),
│   │               # registry.ts, server.ts, http.ts (stateless JSON transport), tool.ts
│   │               # (results, errors, pagination, dry_run, logs), describe.ts (answers)
│   ├── env.ts      # configuration, validated with Zod (TZ included); time.ts: today in TZ
│   └── (jobs/, integrations/ come with 1.5 and phase 2)
├── components/     # Screens and building blocks, fed by view models (props);
│                   # primitives in components/ui (shadcn/ui style, Radix), shell/ = app shell,
│                   # attachments/ = the "Pièces jointes" block and its service context (D-74),
│                   # settings/ = Paramètres and its personal tokens (D-90),
│                   # setup/ = the "Réglages" tab, its sheet and the component sheet's
│                   # "Suspension" section (D-79), procedures/ = rows, detail and editor of the
│                   # maintenance procedures (D-86), runs/ = the run's screen and summary (D-87)
├── lib/            # client-safe: enums.ts (enum values, shared with the schema),
│                   # format.ts / parse.ts (French formats), labels.ts (enum labels), names.ts,
│                   # view-models.ts, display.ts, theme.ts, auth client, history-filter.ts and
│                   # bike-tabs.ts (history filters and bike tab in the address, D-78),
│                   # workshop-filter.ts (the workshop's view, D-85), address.ts (replaceQuery),
│                   # procedures.ts (a procedure's material read for a bike, search, D-86),
│                   # runs.ts (product level after a run, parts' cost, unchecked steps, D-87),
│                   # setup.ts and setup-advice.ts (sag %, setup checks, sourced advice, D-79)
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
| `pnpm db:seed` | Create the fictitious demo account and garage of `/design` (`demo@example.com`, see `src/server/db/seed.ts`), dates moved to the current week, with generated photos and PDFs written to `DATA_DIR`; `--reset` recreates it (and deletes the old files); refuses to run in production |
| `pnpm db:studio` | Drizzle Studio on the dev database |
| `docker compose up --build` | Build and run the production image locally (needs `.env`, see `docker-compose.yml`) |

Releases: push a `v*` tag; GitHub Actions runs the checks, then builds and pushes
`ghcr.io/<owner>/bike-book:<version>` (linux/amd64).
