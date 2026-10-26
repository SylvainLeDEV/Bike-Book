# Decisions, assumptions and open questions

Keep this file current. When an open question is answered, move it to the decision log with its
date. Installation-specific choices (host, network, backup target) are not recorded here: they
belong to each deployment.

## Decision log

| ID | Date | Decision | Rationale |
|----|------|----------|-----------|
| D-01 | 2026-10-24 | One user to start with: the owner of the bikes. No public sign-up | Personal tool. Revised by D-25: the model is multi-user-ready |
| D-02 | 2026-10-24 | Responsive web app, used mostly on PC and tablet, sometimes on a phone. No native app | Replaces the initial "mobile first" idea |
| D-03 | 2026-10-24 | Shipped as one Docker image, deployable on any Docker host | Self-hosting |
| D-04 | 2026-10-24 | Garmin (watch or bike computer) is the ride source of record; Komoot is only used to plan and navigate | Only Garmin needs an integration |
| D-05 | 2026-10-24 | Components never move from one bike to another | Simpler model |
| D-06 | 2026-10-24 | Bike park rides record total time, descent time and number of runs | Lift time must not count as wear |
| D-07 | 2026-10-24 | Photos (bikes, maintenance, parts) and PDF invoices are stored | Warranty, resale, history |
| D-08 | 2026-10-24 | TypeScript stack | |
| D-09 | 2026-10-24 | Meant for a private network; reach it remotely through a VPN. Not hardened for direct Internet exposure | Smaller attack surface; rules out integrations that need public webhooks |
| D-10 | 2026-10-24 | **Next.js** (App Router, TypeScript) + SQLite (WAL) + Drizzle ORM + Tailwind + shadcn/ui | Chosen over SvelteKit for longevity, the richer UI ecosystem and a possible React Native app later. Cost: a steeper learning curve |
| D-11 | 2026-10-24 | All state (database + files) in one data directory, on a **local** filesystem | SQLite must not sit on NFS/SMB; one directory = one thing to back up |
| D-12 | 2026-10-24 | Backups are the operator's responsibility (volume snapshots or a consistent SQLite copy); the app provides a full ZIP export | Keeps the app simple; the export doubles as a portable backup |
| D-13 | 2026-10-24 | Wear on lift-assisted rides = descent time if entered, else moving time, else total time (same logic for distance) | Conservative when descent time is missing |
| D-14 | 2026-10-24 | Phase 2: Garmin's official Personal API (pull) as the main path, FIT file upload as the fallback. Start with a one-evening spike | Unofficial libraries rejected |
| D-15 | 2026-10-24 | Plain HTTP supported on a trusted network; HTTPS, if wanted, is terminated by a reverse proxy | PWA, Web Push and passkeys need HTTPS |
| D-16 | 2026-10-24 | Reference device: Garmin **Edge 540 or 840** | These models have no "Downhill" profile that laps each descent (it exists on the Edge MTB and, since a firmware update, the Edge 1050; **Secondary**). Runs and descent time: manual entry, a lap pressed at the top of each run, or descent detection in phase 2 |
| D-17 | 2026-10-24 | A bike ("Gear") is assigned to every activity in Garmin Connect | Gear is the best key for automatic bike assignment; whether the Personal API exposes it is the **first thing to check** in the phase 2 spike |
| D-18 | 2026-10-24 | Notifications: **Telegram** (weekly digest + threshold crossed) and a **calendar feed (ICS)** | Phase 1.5. Bot token given as a secret. The ICS URL carries a secret token, because calendar apps cannot log in |
| D-19 | 2026-10-24 | E-bike: **Bosch** system, detailed tracking (charge cycles, battery capacity, motor hours, odometer, firmware) | Bosch has no public API (partner platform only; community tools are unofficial). MVP: readings typed by hand from the eBike Flow app into a `readings` table |
| D-20 | 2026-10-24 | Keep photo originals plus resized copies | About 1 GB a year (**Estimate**) |
| D-21 | 2026-10-24 | Merged into D-12 | |
| D-22 | 2026-10-24 | The GitHub repository is **public** | No secrets, no personal data, no installation details in the repository; configuration only through environment variables. Public image on GHCR |
| D-23 | 2026-10-24 | Purchase and sale prices of bikes and parts are tracked, as optional fields | Total cost per bike, cost per year, cost per 1,000 km. Unit revised by D-44: per 100 km |
| D-24 | 2026-10-24 | A suspension and tyre **setup log per bike**: current setup + dated changes (not per ride) | Phase 1.5 |
| D-25 | 2026-10-24 | **Multi-user-ready from day one**: `users`, `workspaces` and `memberships` tables, an auth library that handles several accounts (Better Auth), data owned by a workspace, every query scoped by user and workspace. Only one user and one workspace exist at first; no sign-up, invitations or role management are built yet | Leaves the door open to family, friends or a bike shop with several mechanics, for about one extra evening of work (**Estimate**) instead of a rewrite later. A shop's own needs (customers, intake, quotes) would still be new features |
| D-26 | 2026-10-24 | Auth tables follow the app's plural naming: `users`, `sessions`, `accounts`, `verifications` (Better Auth `usePlural`). **User ids are random text ids generated by Better Auth**, an exception to integer primary keys; workspaces and everything else keep integer ids. `users` also carries the fields Better Auth requires (`email_verified`, `image`, `updated_at`) | Better Auth types ids as strings even with database-generated serial ids, so integer user ids would mean converting at every boundary. Non-guessable user ids are a bonus |
| D-27 | 2026-10-24 | Account creation is allowed while no account exists (first-launch `/setup` screen), then only when `ALLOW_SIGNUP=true`; each new account gets its own workspace (no invitations yet). The rule is enforced in a Better Auth database hook, so the HTTP sign-up endpoint obeys it too. Passwords: 12 characters minimum. Sign-in goes through Better Auth's HTTP endpoint from the browser, not a Server Action | Better Auth's rate limiting (3 attempts per 10 s on sign-in, production only) and origin check apply to HTTP requests only, not to server-side calls (**Verified 2026-10-24** in the Better Auth 1.7.12 source and against the container) |
| D-28 | 2026-10-24 | `AUTH_SECRET` (≥ 32 characters, the example value refused) and `PUBLIC_URL` are **required in production**; the app refuses to start without them. `DATA_DIR` defaults to `./data`, the image sets `/data`. Migrations are applied whenever the app opens the database (at startup, from `instrumentation.ts`): no separate migration step | Without a base URL, Better Auth marks session cookies `Secure` in production and sign-in silently fails over plain HTTP, which D-15 allows (**Verified 2026-10-24** in the Better Auth source) |
| D-29 | 2026-10-24 | Toolchain at scaffold time: Node.js 24 LTS, pnpm 12, Next.js 16.4, React 19.3, TypeScript 5.9, ESLint 9, Tailwind CSS 4, Drizzle ORM 0.45, Better Auth 1.7, Vitest 5. **Cache Components off** | Node 26 is not LTS yet. TypeScript 7 and ESLint 10 exist, but Next.js 16.4's own template still targets TypeScript 5 and ESLint 9. With Cache Components on, production served a prerendered shell and auth redirects became client-side (HTTP 200 instead of 307). The Next.js docs announce it on by default in the next major release: migrating then means Suspense boundaries around session reads and redirects in `proxy.ts` |
| D-30 | 2026-10-25 | **Design direction** as described in [design/README.md](design/README.md): turquoise accent; green, amber and red reserved for wear status, always with an icon and a label; Geist for the interface, Barlow Semi Condensed for figures; bottom tab bar under 700 px, icon rail from 700 to 1023 px, full sidebar from 1024 px; navigation Accueil · Vélos · + · Activité · Atelier; AA contrast in both themes, 44 px touch targets, reduced motion honoured. The quick ride entry and the certainty levels (phase 3) are part of it | Validated on the HTML mockup |
| D-31 | 2026-10-25 | Light and dark themes from phase 1, following the system setting, with a manual override | The tokens exist for both themes; dark mode was planned for 1.5 |
| D-32 | 2026-10-25 | The design is rebuilt in the app at phase 1 step A: real components, fictitious data, a development-only `/design` route. `docs/design/mockups.html` is then deleted (git history keeps it) | One source of truth for the design |
| D-33 | 2026-10-25 | **Workshop ("Atelier")**: an inventory of parts, products and tools owned by the workspace. Stock changes only through movements; restocking goes `to_order` → `ordered` → received. It replaces "parts to order". Phase 1: parts, restocking, search and bike filter; products and tools in 1.5. Its tables are created complete in phase 1 (all three kinds), the UI offering parts only | W1. No table rebuild in 1.5. Tables in [03](03-data-model.md#workshop-d-33-to-d-42) |
| D-34 | 2026-10-25 | `tasks` only holds one-off to-dos, in phase 1, shown under "À prévoir" after the rules (dashboard: all; bike page: that bike's). `kind` and the part fields go; status is `open`, `done` or `cancelled` | W2: restocking lives on the workshop item |
| D-35 | 2026-10-25 | Low stock is a suggestion ("Stock bas · pas encore prévu" in "À racheter"); it never sets `to_order` by itself | W3: less noise |
| D-36 | 2026-10-25 | Products (1.5) are tracked as four levels (full, started, low, empty) plus a container count | W4: what can be judged at a glance |
| D-37 | 2026-10-25 | Online shops are `shops` rows, with `kind` = `physical` or `online` | W5: one way to name a shop |
| D-38 | 2026-10-25 | A part taken from stock costs its last purchase price, prefilled and editable | W6: the difference between costing methods is negligible at this scale |
| D-39 | 2026-10-25 | Stock quantities are computed from movements, never stored | W7: an undo cannot leave a counter out of step |
| D-40 | 2026-10-25 | Tools are not recorded per job | W8: extra typing for little value |
| D-41 | 2026-10-25 | The dashboard's "À racheter" (formerly "Pièces à commander") lists everything to rebuy, most urgent first: needed by a late or due-soon rule, then to order, ordered, low stock | W9 |
| D-42 | 2026-10-25 | The quantity to order is set when ordering, then prefilled and correctable at reception | W10: partial deliveries |
| D-43 | 2026-10-25 | **Bike record** in phase 1: identity, purchase, security (frame number masked except its last group, documents), status, total cost. **Original spec** with every replacement: when, wear at removal, removal reason and its detail (`components.removal_note`) | Validated on the mockup |
| D-44 | 2026-10-25 | Total cost on the bike record, phase 1: purchase + maintenance events − sale price if sold, and per 100 km with and without the purchase. Statistics per month and per year stay in 1.5 | P7. "€ per 100 km" reads like fuel consumption. Formula in [03](03-data-model.md#total-cost-d-44) |
| D-45 | 2026-10-25 | Photos and PDFs in phase 1 without labels: upload, thumbnails, viewer, one gallery per bike. In 1.5: labels, on photos only, and the photo search across bikes. An attachment belongs to exactly one element | P1, P2: the bike gallery and labels cover photos that concern two elements |
| D-46 | 2026-10-25 | **Photos taken with an iPhone and sent from Safari must upload.** File inputs put JPEG first in `accept` and leave HEIC out, so Safari converts to JPEG on the phone. A HEIC file that still arrives (Files app, a Mac) is accepted: original kept, copies made through a HEIC decoder that needs no native library. Formats: JPEG, PNG, WebP, HEIC, and PDF for documents | P9. sharp's prebuilt binaries do not read HEIC (**Verified 2026-10-25** on its install page). Safari's conversion depends on `accept` and on the iOS version (**Secondary**: WebKit bug reports): test on a real iPhone first (H-11) |
| D-47 | 2026-10-25 | **Maintenance procedures** ("fiches d'entretien") in 1.5: list, detail, editor, rule → procedure link, then workshop mode (step by step). Only the owner's own procedures, the examples being demo data. Videos are link cards, never embedded players. A run in progress is kept in the browser's `localStorage`. A product used by a procedure goes one level down by default, adjustable in the summary. "C'est fait" offers the procedure only on due-soon and overdue rules | P3, P4, P5 (privacy, D-09), P6 (iOS Safari often reloads a tab after the screen locks), P8, P11 |
| D-48 | 2026-10-25 | Bike page: tabs below 1024 px (phone and tablet), two columns from 1024 px | P10: the tablet is a main device (D-02); the mockup stacked every section from 700 px |
| D-49 | 2026-10-25 | Phase 3 AI runs on **local models only**: no paid API. The app still talks to an OpenAI-compatible endpoint, which local servers such as Ollama provide | Q-09. Small local models may be too weak for spec extraction (see [07](07-ai.md#llm-backend)) |
| D-50 | 2026-10-25 | **Data readable by an AI**: the database explains itself, so a model (D-49) or a person can use it without guessing. Names carry their meaning and unit; enums are English text values with CHECK constraints, each value defined in 03; one meaning per column; input validated before it is written; derived values computed by tested domain functions, never stored; 03 is the data dictionary, kept in step with `schema.ts`; the ZIP export ships the dictionary. Rules in [03](03-data-model.md#readable-by-an-ai-d-50) | A model that misreads a unit or an enum gives confident wrong answers. Builds on D-25: the scoped data-access functions become the model's read-only tools in phase 3 |
| D-51 | 2026-10-26 | Column names in 03 brought in line with D-50 before any table is created: `purchase_date` → `purchased_on` (bikes, components), `warranty_until` → `warranty_ends_on`, `snoozed_until` → `snooze_ends_on`, `start_from` → `counter_start_at`, `low_stock_at` → `low_stock_threshold`, display-order `position` → `sort_order` (purchase links, procedure steps, items, resources), `estimated_minutes` → `estimated_duration_s`, `value_num` → `value_number`, `battery_capacity_pct` → `battery_capacity_percent`, setups `*_lsc_clicks`/`*_hsc_clicks` → `*_low_speed_compression_clicks`/`*_high_speed_compression_clicks`, `*_tokens` → `*_volume_spacers`, `sag_*_pct` → `sag_*_percent`. Calendar dates are `*_on` only | `*_at` must always be an instant (`low_stock_at` read as one), `position` already means front/rear on components, rules and tasks, durations are in seconds, and abbreviations need the code to decode |
| D-52 | 2026-10-26 | The theme choice (system, light, dark, D-31) is kept **per device in a cookie** (`theme`), not in the database. The root layout reads it and sets `data-theme` on `<html>`; "system" sets nothing and the CSS `prefers-color-scheme` query decides. Tailwind's `dark` variant follows the same rule | The server renders the right theme on the first byte: no flash, no blocking script. Every page becomes dynamic, which the signed-in and auth pages already are |
| D-53 | 2026-10-26 | `docs/design/mockups.html` is **kept** after phase 1 step A and stays the reference for the screens `/design` does not contain yet: products and tools of the workshop, maintenance procedures and workshop mode, photo labels and the all-bikes photo search (phase 1.5), the phase 3 preview. Each of these screens is rebuilt in `/design` when its phase starts; the mockup is deleted once the last one is ported (end of phase 1.5). Amends D-32, which deleted it right after step A | `/design` only holds phase 1 screens (D-33, D-45, D-47): deleting the mockup would leave the 1.5 and 3 designs in git history only |

## Assumptions to confirm

| ID | Assumption | Impact if wrong |
|----|------------|-----------------|
| H-01 | The UI is in French; code, comments and docs are in English | i18n work |
| H-02 | Metric units (km, m, h), EUR, configurable timezone | Unit handling |
| H-03 | Order of magnitude (**Estimate**): up to 10 bikes, 100–250 rides a year, 20–50 maintenance events a year, a few hundred photos a year | Storage sizing only |
| H-04 | Losing up to 24 h of data is acceptable (RPO), and a restore within a day is fine (RTO) | Backup advice |
| H-05 | No offline mode in the MVP: rides are entered afterwards, with a network connection | PWA and offline work |
| H-06 | No existing history to import (spreadsheet, notes…). Past usage is entered as initial counters on bikes and components | Import feature |
| H-10 | Reminders in the MVP are in-app only (dashboard) | Notification work |
| H-11 | Safari on iOS converts HEIC photos to JPEG on upload when the file input does not accept HEIC, and keeps the date taken (**Secondary** / **Unverified**). To test on a real iPhone at the start of the attachments feature | HEIC decoding on the server becomes the main path; without the date taken, `taken_at` falls back to the upload time |

(H-07 to H-09 were installation-specific and moved out of this repository.)

## Open questions

| ID | Question | Why it matters | Default if unanswered |
|----|----------|----------------|-----------------------|
| Q-01–Q-10 | Answered: Q-01 to Q-08 and Q-10 on 2026-10-24 (D-16 to D-24), Q-09 on 2026-10-25 (D-49) | | |

The design questions W1–W10 and P1–P11 were answered on 2026-10-25 (D-33 to D-48). No question
is open on that date.
