# Bike-Book

Track all your bikes in one place — rides, maintenance, parts and upcoming service.

> **Status (2026-10-26): Phase 1 — MVP, in progress.** Accounts, the app shell (light and dark
> themes), bikes with their full record, components and their history, rides, maintenance, the
> rule engine ("À prévoir"), tasks, the workshop ("À racheter") and the ZIP export. Photos and
> documents come next.

## Quick start

Requirements: Node.js 24 or later and pnpm 12 (or Docker).

```bash
pnpm install
pnpm dev            # http://localhost:3000, data in ./data
```

The first visit opens a setup screen that creates your account and your garage. To try the app
with fictitious data instead, run `pnpm db:seed` before the first visit (`--reset` recreates the
demo).

With Docker, using the production image:

```bash
cp .env.example .env   # then set AUTH_SECRET: openssl rand -base64 32
mkdir -p data/compose
docker compose up --build
```

Configuration is only through environment variables: see `.env.example` and
[docs/04-architecture.md](docs/04-architecture.md#configuration).

## In one paragraph

A self-hosted, single-user web app that lists every bike you own — road, gravel, enduro, DH,
e-MTB… For each one it logs rides, maintenance and components, and shows what is coming up:
services due by hours, kilometres or date, and parts to rebuy. It ships as one Docker image
that keeps all its data in a single directory, and is meant to run on your own server, on a
private network.

## Key decisions so far

| Topic | Decision | Status |
|-------|----------|--------|
| Users | One user to start with; users and workspaces modelled from day one, no public sign-up | Decided |
| Devices | Responsive web app, mostly PC and tablet, phone-friendly | Decided |
| Ride source | Garmin; Komoot only for planning | Decided |
| Stack | TypeScript: Next.js + SQLite (Drizzle ORM) + Tailwind/shadcn/ui | Decided |
| Packaging | One Docker image, configured through environment variables | Decided |
| Data | One data directory (SQLite + files) on a local filesystem | Decided |
| Backups | The operator backs up the data directory; built-in ZIP export | Decided |
| Network | Private network or VPN; HTTPS optional through a reverse proxy | Decided |
| Wear in bike park | Descent time if entered, else moving time, else total time | Decided |
| Design | Turquoise accent, light and dark themes, bottom bar / rail / sidebar by width | Decided |
| Workshop | Parts in stock and restocking in phase 1; products, tools and maintenance procedures in 1.5 | Decided |
| GPS import (phase 2) | Garmin **Personal API** (new on 2026-10-21), FIT file upload as fallback | Decided |

The full list, with assumptions and open questions, is in
[docs/02-decisions-and-questions.md](docs/02-decisions-and-questions.md).

## Documents

| File | Content |
|------|---------|
| [01-vision-and-scope.md](docs/01-vision-and-scope.md) | Concept, usage context, principles, what goes into each version |
| [02-decisions-and-questions.md](docs/02-decisions-and-questions.md) | Decision log, explicit assumptions, open questions |
| [03-data-model.md](docs/03-data-model.md) | Entities, fields, wear counters, reminder rules, ERD |
| [04-architecture.md](docs/04-architecture.md) | Stack and why, configuration, running it with Docker, data, backups, security, pitfalls |
| [05-roadmap.md](docs/05-roadmap.md) | Phases 0 → 3 with checklists and exit criteria |
| [06-integrations.md](docs/06-integrations.md) | Garmin, Komoot, Strava, Apple Health, Bosch…: public API, access rules, limits, what is still uncertain |
| [07-ai.md](docs/07-ai.md) | Phase 3: maintenance prediction and manufacturer data retrieval |
| [ideas-backlog.md](docs/ideas-backlog.md) | Ideas not scheduled yet |
| [design/](docs/design/README.md) | Design direction (decided) and HTML mockups of the main screens, until phase 1 step A |

## Labels used in these docs

| Label | Meaning |
|-------|---------|
| **Decided** | Agreed, dated |
| **Proposed** | A recommendation not yet validated |
| **Assumption H-xx** | Stated explicitly so it can be challenged (list in 02) |
| **Estimate** | An order of magnitude, not a measurement |
| **Verified YYYY-MM-DD** | Checked against the linked source on that date |
| **Secondary** | Reported by press, blogs or forums, not by the provider itself |
| **Unverified** | Could not be confirmed: treat it as a lead and test before relying on it |
