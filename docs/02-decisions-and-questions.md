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
| D-23 | 2026-10-24 | Purchase and sale prices of bikes and parts are tracked, as optional fields | Total cost per bike, cost per year, cost per 1,000 km |
| D-24 | 2026-10-24 | A suspension and tyre **setup log per bike**: current setup + dated changes (not per ride) | Phase 1.5 |
| D-25 | 2026-10-24 | **Multi-user-ready from day one**: `users`, `workspaces` and `memberships` tables, an auth library that handles several accounts (Better Auth), data owned by a workspace, every query scoped by user and workspace. Only one user and one workspace exist at first; no sign-up, invitations or role management are built yet | Leaves the door open to family, friends or a bike shop with several mechanics, for about one extra evening of work (**Estimate**) instead of a rewrite later. A shop's own needs (customers, intake, quotes) would still be new features |
| D-26 | 2026-10-24 | Auth tables follow the app's plural naming: `users`, `sessions`, `accounts`, `verifications` (Better Auth `usePlural`). **User ids are random text ids generated by Better Auth**, an exception to integer primary keys; workspaces and everything else keep integer ids. `users` also carries the fields Better Auth requires (`email_verified`, `image`, `updated_at`) | Better Auth types ids as strings even with database-generated serial ids, so integer user ids would mean converting at every boundary. Non-guessable user ids are a bonus |
| D-27 | 2026-10-24 | Account creation is allowed while no account exists (first-launch `/setup` screen), then only when `ALLOW_SIGNUP=true`; each new account gets its own workspace (no invitations yet). The rule is enforced in a Better Auth database hook, so the HTTP sign-up endpoint obeys it too. Passwords: 12 characters minimum. Sign-in goes through Better Auth's HTTP endpoint from the browser, not a Server Action | Better Auth's rate limiting (3 attempts per 10 s on sign-in, production only) and origin check apply to HTTP requests only, not to server-side calls (**Verified 2026-10-24** in the Better Auth 1.7.12 source and against the container) |
| D-28 | 2026-10-24 | `AUTH_SECRET` (≥ 32 characters, the example value refused) and `PUBLIC_URL` are **required in production**; the app refuses to start without them. `DATA_DIR` defaults to `./data`, the image sets `/data`. Migrations are applied whenever the app opens the database (at startup, from `instrumentation.ts`): no separate migration step | Without a base URL, Better Auth marks session cookies `Secure` in production and sign-in silently fails over plain HTTP, which D-15 allows (**Verified 2026-10-24** in the Better Auth source) |
| D-29 | 2026-10-24 | Toolchain at scaffold time: Node.js 24 LTS, pnpm 12, Next.js 16.4, React 19.3, TypeScript 5.9, ESLint 9, Tailwind CSS 4, Drizzle ORM 0.45, Better Auth 1.7, Vitest 5. **Cache Components off** | Node 26 is not LTS yet. TypeScript 7 and ESLint 10 exist, but Next.js 16.4's own template still targets TypeScript 5 and ESLint 9. With Cache Components on, production served a prerendered shell and auth redirects became client-side (HTTP 200 instead of 307). The Next.js docs announce it on by default in the next major release: migrating then means Suspense boundaries around session reads and redirects in `proxy.ts` |

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

(H-07 to H-09 were installation-specific and moved out of this repository.)

## Open questions

| ID | Question | Why it matters | Default if unanswered |
|----|----------|----------------|-----------------------|
| Q-01–Q-08, Q-10 | Answered on 2026-10-24, see D-16 to D-24 | | |
| Q-09 | Budget for paid services in phase 3 (LLM API)? | AI design | Any OpenAI-compatible endpoint, with a spend limit |
