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
| Scheduled jobs | In-process timers started from Next.js `instrumentation.ts` (`src/server/jobs/scheduler.ts`, D-101): a fixed interval needs no library; croner if reminders need cron expressions later | Reminders (phase 1.5) and Garmin sync (phase 2) need no queue | System cron calling a protected route |
| Authentication | **Better Auth** (email + password, Drizzle adapter, SQLite) | Supports several users from day one; roles, invitations, organisations and passkeys can be switched on later without a rewrite (D-25). Plugin availability to confirm at scaffold time | Auth.js; a hand-rolled single password (simplest, but a rewrite once there are several users) |
| MCP server (D-90) | **`@modelcontextprotocol/server`** 2.4.0, the TypeScript SDK's v2 | An external assistant dictates bikes and parts through the app's own validation. Web `Request`/`Response` handler, two dependencies (its core, Zod) | v1 `@modelcontextprotocol/sdk` (about fifteen dependencies: express, hono, cors…); a separate server reading the SQLite file (bypasses validation and scoping) |
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
│       ├── mcp/           # The MCP server for an external assistant, personal token (D-90)
│       └── uploads/       # POST streams one file to disk; [id]/ serves it (feature 10)
├── components/            # Screens and building blocks, data received as view models (props)
│   ├── ui/                # Primitives (shadcn/ui style, Radix): button, field, chip, sheet, toast…
│   ├── shell/             # App shell: sidebar / rail / bottom bar, top bar, theme, account
│   ├── dashboard/ bike/ workshop/ rides/ plan/ photos/ setup/ procedures/ runs/
│   ├── attachments/       # "Pièces jointes" block, upload rows, editor, service context
│   └── …                  # Shared: wear bar and badges, timeline, bike cover, empty state
├── lib/                   # Client-safe: enum values (enums.ts), French formatting and parsing,
│                          # enum labels, name comparison, view-model types, theme,
│                          # procedures.ts (readiness), runs.ts (summary defaults, D-87)
├── server/                # Server-only code (`import "server-only"`)
│   ├── db/                # Drizzle schema, migrations, seed, scoped data-access layer
│   ├── auth/              # Better Auth setup, current user and workspace, personal tokens
│   │                      # (tokens.ts: authenticateBearer, D-90)
│   ├── actions/           # Server Actions (forms) and their Zod input schemas (*-input.ts)
│   ├── domain/            # Pure, tested logic: bike status, total cost, (wear, rules, stock…)
│   ├── views/             # View models of the real pages, from the data-access layer + domain
│   ├── export/            # ZIP writer, CSV, data dictionary for the export (D-68)
│   ├── files/             # Uploads on disk: streaming, atomic rename, sharp copies (feature 10)
│   ├── mcp/               # MCP tools (D-90): tools/ one file per domain, registry.ts, server.ts,
│   │                      # http.ts (stateless JSON transport), tool.ts, describe.ts
│   ├── integrations/garmin/ # Garmin Personal API (D-101): client.ts (token, list, FIT, retries),
│   │                      # sync.ts (the import), fit.ts (ZIP reader), errors.ts
│   ├── jobs/              # scheduler.ts: the Garmin import every GARMIN_SYNC_INTERVAL_H hours
│   ├── theme.ts           # Reads the theme cookie
│   ├── time.ts            # "Today" in the configured TZ
│   ├── startup.ts         # Server start: configuration, database (migrations); exit on failure
│   └── env.ts             # Configuration, validated with Zod
└── instrumentation.ts     # Runs server/startup.ts at startup (database, then the scheduler)
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
  (icon rail), `lg` = 1024 px (full sidebar, two-column bike overview with its history tab D-78,
  workshop list and item side by side). Touch targets grow to 44 px with `pointer-coarse:`; inputs use 16 px text.
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
| `/bikes/[bikeId]` | Page vélo | `?tab=` selects the tab (`plan`, the default, is left out; `setup` and `history` at every width, the others below 1024 px, D-78, D-79); the bike cards' "Réglages" shortcut opens `?tab=setup`; `?year=`, `?month=` and `?kind=` (repeated: `ride`, `maintenance`, `task`) filter the history (D-78). The tab and the filters are kept in the address as they change. `?done=<rule>`, `?replace=<item>` and `?event=<maintenance event>` (D-70) open a sheet on arrival, then leave the address |
| `/runs/[runId]` | Suivi | A run of a procedure or a task (D-87): one step at a time, full screen over the app shell; "Terminer" shows the summary, then goes to the bike's history (or the dashboard for a general task). A done run stays readable ("Voir le suivi", the event's photos) |
| `/activity` | Activité | Rides, maintenance and done tasks log (features 4, 5 and 7; D-77) |
| `/workshop` | Atelier | Parts, products, tools (D-85) and maintenance procedures ("Fiches", D-86). `?tab=` selects the filter (`parts`, the default, is left out; `products`, `tools`, `rebuy`, `procedures`), `?bike=` the bike, `?q=` the search, `?item=` the item open, `?procedure=` the procedure open: read on arrival (an item alone opens its kind's tab) and rewritten in place as they change (`src/lib/workshop-filter.ts`, D-85). `?new=1` opens "Nouvelle fiche" on arrival (from a bike page, with `?bike=`), then leaves the address. Items and procedures are not routes of their own: under 1024 px they replace the list, from 1024 px the list stays beside them |
| `/settings` | Paramètres | Account and sign-out, theme of this device, "Exporter mes données" (feature 12, D-68; labelled "Paramètres" since D-80), "Accès pour un assistant": personal tokens of the MCP server (D-90) |
| `/login`, `/setup` | Connexion, premier lancement | Unchanged |
| `/api/uploads`, `/api/uploads/[id]` | Pièces jointes | `POST /api/uploads?owner=<kind>&id=<n>&lastModified=<ms>[&cover=1]`: the raw file as body, its name in `X-File-Name` (URI-encoded), 201 `{ id }` or an error `{ error, message }` (401, 404, 413, 415). Without a session, a signed upload link for that element in `X-Upload-Link` (D-99); a link that does not authenticate answers 401 `link_invalid`, no link and no session 401 `signed_out` (D-100). `GET /api/uploads/<id>[?size=thumb\|display][&download=1]`: signed in, scoped, `nosniff`, private cache revalidated by ETag (D-76) |
| `/api/export` | Export ZIP | Current workspace only, auth tables never included; 401 when signed out (D-68) |
| `/api/mcp` | Serveur MCP | `POST` only, JSON-RPC, stateless, JSON answers (no SSE); a personal token in `Authorization: Bearer bb_…`, never the session cookie; 401 without it, 405 for GET and DELETE, 413 over 1 MB ([MCP server](#mcp-server-d-90), D-90) |
| `/design` | Design system | Development only |

Quick ride entry, maintenance entry, "Remplacer une pièce" and the edit sheets are sheets, not
routes: they open from any screen and keep it underneath.

## MCP server (D-90)

Status: **Decided** and built on 2026-11-03 (V1: bikes and parts; D-91: rules; D-92: rides, what
is to do, the workshop, the procedures; D-93: maintenance done; D-94: restocking and edits;
D-95: maintenance history, setups, archiving; D-96: usage and cost, writing procedures;
D-97: rides imported in batches; D-98: runs, deletes for mistakes; D-99: photos and PDFs through upload links;
D-100: answers fixed after the real-use test).

An assistant on the owner's computer (Claude Code) reads and writes bikes, parts, rules, rides,
tasks and the workshop, and reads the procedures, through `POST /api/mcp`. Registering it, once a token exists (Paramètres › "Accès pour un assistant"):

```text
claude mcp add --transport http --scope user bike-book http(s)://<your-hostname>/api/mcp \
  --header "Authorization: Bearer <token>"
```

**Transport.** `src/app/api/mcp/route.ts` authenticates the token (`authenticateBearer`), then
`src/server/mcp/http.ts` serves the request with a new MCP server whose tools are bound to that
access context: no session, no SSE, one JSON answer per request. The SDK's `createMcpHandler`
serves the 2026-07-28 revision (`responseMode: "json"`); a request of the 2025 revisions
(`isLegacyRequest`) goes to a stateless `WebStandardStreamableHTTPServerTransport` with
`enableJsonResponse` (the SDK's own fallback would answer it in SSE). Bodies over 1 MB answer 413.

**A thin layer.** A tool maps its input to the form's input, validates it with the form's Zod
schema (`src/server/actions/*-input.ts`), calls the data-access layer and the domain, and
describes the result. Anything that computes or decides lives in `src/server/domain` or
`src/server/db`, shared with the UI and the future Garmin sync.

**Conventions for tools** (`src/server/mcp/tool.ts`):

- One file per domain in `src/server/mcp/tools/` (`bikes.ts`, `components.ts`, `rules.ts`,
  `rides.ts`, `maintenance.ts`, `setups.ts`, `usage.ts`, `runs.ts`, `attachments.ts`, `todo.ts`, `workshop.ts`, `procedures.ts`), listed in `registry.ts`.
- Names are `verb_noun` in snake_case and stable: tools are added, never renamed.
- Input in the app's raw units, recalled in each description (D-50): distances in metres,
  durations in seconds, weights in grams, money in euro cents, dates `YYYY-MM-DD`, instants ISO
  8601 UTC, enums with their values. Field names are the snake_case of the form's fields. Input
  objects are strict (`z.strictObject`, nested ones too): an unknown or misspelt field is refused
  by the SDK, never silently ignored.
- Answers: structured JSON (`structuredContent`, also as a JSON text block) and a short text
  summary in English. Never the frame number. Summaries and `warnings` are in English, written
  for the assistant, which tells the owner in their language; the server instructions say so
  (D-100). One language per warning; French only for the app's own words (labels, `stock_text`)
  and `errors[].message`.
- One name per thing (D-100): the same key in a dry run and its write (`delete_ride`: `ride`),
  the same shape before and after (`create_rides`' `bikes[].before` and `after`), no field
  repeated next to the object that holds it (`list_maintenance`: `bike`, no `bike_id`), enums and
  nested keys in snake_case (`rebuy_reason`). A null means one thing: `get_bike_usage`'s
  `rule_status` is null only without a rule.
- A refused input answers `isError` with `errors: [{ field, message }]`: the tool's field
  (`components[2].suspension.max_clicks.low_speed_rebound`) and the form's French message, so
  the assistant fixes it and tries again. A value of the wrong type is refused by the SDK before
  the tool runs, with its own English message.
- Writes take a **required `dry_run`**. A dry run runs the real write in a transaction that is
  always rolled back (`previewWrite` in `src/server/db/transactions.ts`): the same checks (names
  taken, slots taken, positions), the would-be result with its warnings, ids left out, nothing
  kept. A write of several rows is one transaction (`atomically`), all or nothing, and answers the
  ids created. Never a function that deletes files after its commit in a dry run (D-76).
- Lists are paginated: `limit` (1–100, default 50) and an opaque `cursor` (`next_cursor`).
- Each write logs one line (tool, workspace, token id, ids written); a dry run logs nothing.
- Deletes only for what the app's sheets delete to fix a mistake (D-98): `delete_ride` (D-92),
  `delete_rides` (D-97, an import's undo), `delete_maintenance`, `delete_setup`, `abandon_run`: `kind: "delete"` (`destructiveHint`), a
  `dry_run` that only describes what would go (never `previewWrite`, since deleting a ride
  removes its files after the delete), and only rides typed by hand. Nothing else is deleted.

**Tools of V1:** `list_bikes`, `get_bike`, `list_component_types` (read-only), `create_bike`
(optionally with its `components`), `update_bike`, `add_component`, `update_component` (only the
fields given change), `set_suspension_specs` (merged with the current specs). Since 0.3.1
(D-91): `list_rules` (read-only) and `add_rule` (`tools/rules.ts`).

**Rules of a bike (D-91).** `add_rule` is the "Règles" sheet's "Nouvelle règle": the same schema
(`ruleInputSchema`, `toRuleData`), the same slots (`ruleSlots`: the whole bike, each fitted slot,
both ends of a front/rear type, so a type with no part fitted is refused), the same defaults
(warn from 90 %, replacing the part restarts the rule). `last_done_on` works as for a new part's
rules below; the answer gives the rule's status, and the dry run warns when it would start
overdue or due soon. Changing, snoozing or deactivating a rule stays in the app.

**Rules of a new part.** A part gets its type's rule templates (`rules` omitted), some of them
(`rules: [{ template_id }]`) or none (`[]`). Each may carry `last_done_on`: the counter then starts
at the end of that day, exactly as "Dernière fois" in the "Règles" sheet (`lastDoneOnSchema`,
`ruleCounterStart` in `src/server/actions/rule-input.ts`). Without it, a rule counts from the
part's fitting: an original part of a bike bought two years ago starts with its day-based rules
overdue. `rules_created` gives each rule's `status`, `counts_from` and `due_on` from the rule
engine, and the dry run warns when one would start overdue or due soon.

**Rides (D-92).** `list_rides` (newest first; `totals` over the whole filtered list),
`create_ride` (the quick entry's `quickRideSchema` and `toRideData`), `update_ride` (the ride as
"Modifier la sortie" edits it, `rideForm`, the fields given replacing its own), `delete_ride`.
Writes answer `rules_made_due` (rules whose status the ride moves to due soon or overdue, from
the rule engine before and after the write) and warn about a ride of the same bike starting
within ±30 minutes (`ridesNear` in `src/server/domain/rides.ts`).

**Rides in batches (D-97).** `create_rides`: up to 500 rides, each checked as `create_ride`
does, written in one transaction (all or nothing, errors named `rides[3].duration_s`), source
`manual`; a ride before the bike's purchase is refused; duplicates (`ridesNear`) warned, or left
out with `skip_duplicates` (each `skipped[]` names its `matching_ride_id`); initial counters
warned with each bike's totals before and after, in the same shape. `delete_rides` undoes it from
the ids it answers.

**What is to do (D-92).** `list_due_work` is the dashboard's "À prévoir" (`loadGarage`): the
overdue and due-soon rules, the open tasks and the runs in progress, each rule and task with its
procedure's material read against the workshop for its bike (`procedureNeeds`, `readinessOf` in
`src/lib/procedures.ts`); a summary, not paginated. `add_task` validates with `taskSchema`
(`src/server/actions/task-input.ts`).

**Workshop (D-92).** `list_workshop_items` describes the workshop's view models (`loadGarage`):
stock computed from movements, `stock_text` in the app's French words, rebuy state, links, rules
served. `add_workshop_item` validates with `itemInputSchema` and writes through `newItem` and
`createItem`; a field of another kind is refused; `bike_ids` omitted means all bikes.
`update_stock` writes one movement as the item's buttons do (`containersChange`, `levelChange`,
`ownedChange`, then `addMovement` or `setToolOwned`). Since D-94: `update_workshop_item`
(`itemData`, `updateItem`, a purchase link with `add_link`), `set_restock` (`setRestock`) and
`receive_item` (`receiveItem`, at the cheapest link's price unless one is given). Since D-100:
`to_rebuy` gives `rebuy_reason` in snake_case from `rebuyRows` (`rule`, `to_order`, `ordered`,
`low_stock`), and `include_archived` adds the archived items (`archivedItems` in
`src/server/views/workshop.ts`: built as the others, serving no rule; the app lists none).

**Edits (D-94).** `update_task` (`taskSchema`, `updateTask`), `update_rule` (the rule as the sheet
edits it, `ruleFormInput`, then `ruleInputSchema` and `updateRule`; its slot never changes) and
`snooze_rule` (`snoozeRule`). Only the fields given change; null clears.

**Maintenance done (D-93).** `record_maintenance` is the maintenance sheet (`maintenanceSchema`,
`createMaintenanceEvent`): a line with `rule_id` restarts that rule, and takes the app's own line
when `component_id` and `action` are left out (`doneLine` in `src/server/views/rules.ts`, shared
with "C'est fait"). `replace_component` is "Remplacer une pièce" (`replacePartSchema`,
`replaceComponent`, its messages from `replacementError`), with a part from the workshop's stock
(`from_item_id`) or typed. `set_task_done` marks a task done or open again (`setTaskStatus`).

**History and setups (D-95).** `list_maintenance` (filters bike, days, part, rule, words) and
`update_maintenance` ("Modifier l'entretien": `maintenanceEdit`, then `updateMaintenanceEvent`;
its replacements stay). `list_setups` and `add_setup` (`setupPrefill` from the current setup, the
values given merged in, `parseSetupInput` against the part's specs, `createSetup`).
`archive_workshop_item` (`setItemArchived`, reversible; its `url` is the workshop's while the
item is archived, D-100).

**Runs (D-98).** `start_run`, `get_run` (`getRunPage`: the summary the screen proposes; without
the run's rule nor one pointing to the procedure, the only active rule on its part type, and
each rule's slot, D-100), `update_run_steps` (answers the steps and `unchecked_steps` only),
`finish_run` (`finishRunSchema`, `parseFinishRun`, `finishRun`; every field left out takes the
summary's proposal; answers the event as written, read back inside the transaction, so the dry
run shows it whole) and `abandon_run`. A finished run's undo is
`delete_maintenance` on its event, which gives the stock back. `delete_maintenance` previews in
`previewWrite` only when no attachment is involved; `update_setup` and `delete_setup` correct the
setup log.

**Usage and cost (D-96).** `get_bike_usage`: the bike page's totals, `totalCost` and each fitted
part's wear with the parts before it (`fittedSlots`), read-only. Each part's `rule_status` comes
from `partStatuses` over the bike's active rules, whatever its status (D-100); `type_code` or
`component_id` keeps those parts' slots.

**Procedures (D-92, D-96).** `list_procedures` and `get_procedure`, from `procedureVMs`, with the
material read for a bike. `create_procedure`, `update_procedure` (lists replaced whole; a step
kept passes back its id) and `archive_procedure`, through `procedureInputSchema` and
`parseProcedureInput`. A dry run that would remove a step's photos describes the change instead
of running it: `updateProcedure` deletes those files after its write.

**Attachments (D-99).** Files never go through the MCP. `get_upload_link` answers the URL of
`/api/uploads` for one element and a signed link (`src/server/auth/upload-links.ts`: the token's
id, the element, a 15-minute expiry, HMAC-SHA256 under a key derived from `AUTH_SECRET`; nothing
stored). The assistant sends each file from the owner's computer:
`curl -X POST --data-binary @file -H "X-Upload-Link: …" -H "X-File-Name: …" "<url>"`. The link is
a header, never in the URL, which access logs keep. It works for that element until it expires,
and stops when its token is revoked; a link that fails answers `link_invalid`, so the assistant
asks for a new one (D-100). `list_attachments`, `update_attachment` and `delete_attachment`
handle them afterwards (`delete_attachment` warns when the photo is its element's photo).

**Later (not built):** adding or removing a run's steps along the way; FIT files read by the app
(phase 2.1), sent with an upload link, their duplicates checked by the same `ridesNear` as every
import. The phone goes through Claude Code's remote control: the app is not exposed to the
internet for claude.ai's connectors (D-99).

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
| `GARMIN_SYNC_INTERVAL_H` | No (default `6`) | Hours between two automatic Garmin imports; `0` turns them off ("Synchroniser maintenant" stays). The key itself is typed in Paramètres, encrypted in the database (D-101), never in the environment |
| `GARMIN_MIN_DURATION_S` | No (default `60`) | Activities shorter than this on the timer are left out (stray recordings of a few seconds) |
| `GARMIN_TOKEN_REFRESH_MARGIN_S` | No (default `3600`) | A new Garmin token is asked for when the current one has less than this left (read from its `exp`) |
| `GARMIN_KEY_WARN_DAYS` | No (default `30,7`) | Days before the key's expiry when the app warns (notice on every page, a log line) |
| `GARMIN_DOWNLOAD_FIT` | No (default `false`) | `true`: each imported ride keeps its FIT file as an attachment |
| `GARMIN_API_BASE_URL` | No (default `https://personal.connectapi.garmin.com`) | Garmin's China server is `https://personal.connectapi.garmin.cn` |

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
- **Built-in export (MVP):** Paramètres › "Exporter mes données": one ZIP with every table as CSV
  and JSON, the data dictionary (D-68) and the attachments' originals under `uploads/` (feature
  10; 4 GiB at most, pitfall 10). A portable,
  readable copy you can keep anywhere, and a safety net for mistakes noticed late. The app
  cannot import it back, so it complements the backup of the data directory, it does not
  replace it.
- **History matters more than frequency:** a deletion noticed a week later needs a backup from
  before it. Keep at least a few weeks of history if you can.
- **Test a restore** once before relying on the backups: before entering real data, or with only
  a few entries you could type again (D-89). Restore to a separate copy, never over the running
  app. The copy answers at another address: set its `PUBLIC_URL` to that address, or sign-in is
  refused (origin check).

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
- **Personal tokens and the MCP endpoint (D-90).** `/api/mcp` accepts only a personal token
  (`bb_` and 256 random bits), created in Paramètres, shown once, stored as its SHA-256, tied to a
  user and a workspace, revocable; the session cookie does not open it, so a page on another
  site cannot drive it through the browser. `authenticateBearer` rebuilds the same scoped
  `AccessContext` as a session (membership checked on every request) and records the last use.
  Tokens never appear in logs or in the export. The tools delete only to fix a mistake (D-98) and
  never read the frame number. An upload link (D-99) is signed, scoped to one element, expires
  after 15 minutes, dies with its token, and travels in a header, never in a URL. Whatever the assistant reads goes to its provider, outside the private network
  (D-49 covers the app's own AI only): one token per assistant, revoked when no longer used.
- Container: non-root user, read-only root filesystem, `no-new-privileges`.
- **Public repository (D-22):** no secrets, no real data, no installation details. `.gitignore`
  covers `data/`, `.env*` and uploads; seed data is fictitious; GitHub secret scanning and push
  protection enabled. Dependencies updated with Renovate or Dependabot.
- **The Garmin key (D-101)** gives read access to activities and health data: treat it like a
  password. Typed in Paramètres (a password field), it is stored encrypted with AES-256-GCM under
  a key derived from `AUTH_SECRET` (HKDF-SHA256, `src/server/auth/secrets.ts`), so the database
  or a backup of the data directory alone does not give it; it is never sent back to the browser
  (its last 4 characters only), never logged, never exported (`integrations` is left out of the
  ZIP). Changing `AUTH_SECRET` makes it unreadable: the app says to type it again. Garmin's
  tokens (24 h) stay in memory only. It expires within a year anyway.

## Observability

- Logs as JSON lines on stdout, for any log collector.
- `/api/healthz` for the container health check and uptime monitoring.
- Each write through the MCP logs one JSON line on stdout (`"event": "mcp_write"`, the tool,
  `workspace_id`, `token_id` and the ids written), nothing typed by the owner (D-90).
- Each Garmin import logs one JSON line (`"event": "garmin_sync"`: outcome, counts, the first
  day asked, an error's kind and status code; never the key, a token or a body), and a key within
  its warning days one line a day (`"event": "garmin_key_expiring"`, D-101).
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
5. **Garmin key expiry (D-101).** The Personal API key lasts 30 days to a year and nothing reads
   its expiry: the owner types the date with the key. The app warns 30 then 7 days before (a
   notice on every page), stops importing after that day, and stops too when Garmin refuses the
   key (401 twice): Paramètres says to create a new key. Garmin's reminder email is not relied on.
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
11. **"Copier" over plain HTTP.** The Clipboard API exists in secure contexts only (HTTPS or
    localhost), not on `http://bikes.lan` (D-15): "Copier" in Paramètres falls back to the older
    copy command, and says to select the text when even that fails.
12. **MCP SDK and SSE.** The SDK's default fallback for 2025-era clients answers in SSE even when
    the modern path is set to JSON (**Verified 2026-11-03** in `@modelcontextprotocol/server`
    2.4.0): the endpoint routes those requests itself (`src/server/mcp/http.ts`). Check it again
    when upgrading the SDK.
13. **Garmin's `activityType` takes a parent type only.** Garmin's Swagger says a subtype there
    answers 400: gravel is `activitySubType=gravel_cycling` of `activityType=cycling` (Verified
    2026-11-03 in the Swagger and, for `cycling`, on the owner's account; the 400 itself was not
    tried). The import asks for `cycling` and keeps every cycling subtype.
14. **Server Function arguments in development logs.** `next dev` prints each Server Function
    call with its arguments (**Verified 2026-11-03** in the Next.js 16.4 docs and on the dev
    server): the Garmin key typed in Paramètres appeared in clear, and the first account's
    password (a Server Action too) would. `logging.serverFunctions` is off in `next.config.ts`;
    the docs say production does not log them.

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
