# Roadmap

Sizes are **Estimates** in evenings of about 2–3 hours, for one person learning parts of the
stack along the way. They are there to compare phases, not to plan dates.

```text
Phase 0 Foundations ─► Phase 1 MVP ─► Phase 1.5 Comfort (optional)
                                   └─► Phase 2 Garmin ─► Phase 3 AI
```

Phase 2 can start once the MVP is in daily use. Its first step (the API spike) can even run
during phase 1, because Garmin's Personal API is brand new and its limits are not documented
publicly yet.

## Phase 0 — Foundations (≈ 4–6 evenings)

Goal: an empty app, deployed the way it will run for real, with a backup that has been
restored once, **before any real data goes in**.

- [x] Validate proposals P-01 to P-06 (done 2026-10-24: D-10 to D-15)
- [x] Answer Q-01 to Q-07 (done 2026-10-24: D-16 to D-22)
- [x] Scaffold: Next.js (App Router, standalone output) + strict TypeScript + Tailwind + shadcn/ui + Drizzle + SQLite, ESLint, Prettier, Vitest (done 2026-10-24, versions in D-29)
- [x] Auth with Better Auth: first-launch setup screen (first user + workspace), login, data-access layer scoped by user and workspace (D-25) (done 2026-10-24, D-26 to D-28)
- [x] Dockerfile (non-root, health check) and a local compose file (done 2026-10-24)
- [x] CI: lint and tests on each push; build the image and push it to GHCR on each `v*` tag (written 2026-10-24, not run on GitHub yet)
- [x] Deploy the image on the target host, behind its reverse proxy (done 2026-10-25 with 0.1.0; installation-specific steps are kept outside this repository)
- [ ] Backups of the data directory in place, restore tested once
- [ ] Check through the proxy: a form submit (Server Actions origin check) and a 10 MB upload
- [x] Health check monitored (done 2026-10-25: probed directly and through the proxy, alert on failure)

**Exit:** the empty app answers on its address, locally and through the VPN, and a restore has
been tested.

## Phase 1 — MVP, manual entry (≈ 18–28 evenings)

Scope decided on 2026-10-25 (D-30 to D-46): the size grew from 12–20 evenings with the design
system, the bike record and the workshop (**Estimate**).

**Step A — design system (≈ 3–5 evenings).** The mockup's screens rebuilt in the app with real
components and fictitious data, on a development-only `/design` route (D-32): tokens for light
and dark themes (D-31), Geist and Barlow Semi Condensed through `next/font`, lucide icons, the
responsive shell (bottom bar, rail, sidebar), the building blocks (buttons, badges, chips, cards,
lists, fields, wear bar, timeline, sheet, toast with undo, empty states, skeletons), then the
dashboard, bike page, quick ride entry and workshop screens. `docs/design/mockups.html` stays the
reference of the 1.5 and 3 screens until they are ported (D-53).

- [x] Built on 2026-10-26 at `/design` (development only): tokens, light and dark themes (D-52),
  shell, building blocks, dashboard, bike page, quick ride entry, workshop (parts), Foundation
  board with live contrast.
- [x] Owner validation of `/design` (2026-10-26); the mockup is kept for the 1.5 and 3 screens (D-53)
- [x] Routes of step B validated ([04](04-architecture.md#routes), D-54, 2026-10-26)

**Then, one feature at a time**, each with its migration, its scoped data access (D-25), its
pure tested domain logic, its screens, and its tables described in the data dictionary (D-50):

| # | Feature | Notes | Done |
|---|---------|-------|------|
| 1 | Bikes | Create/edit, full record: identity, purchase, security (frame number masked), status with its effect (D-43) | ✓ 2026-10-26 (D-54 to D-58) |
| 2 | Reference data | Component types and rule templates, by data migration ([03](03-data-model.md#rule_templates-reference-data-editable)) | ✓ 2026-10-26 (D-59) |
| 3 | Components | Original spec sheet, replacements with reason and detail, history per slot, "replace a part" flow (from the workshop once item 8 exists) | |
| 4 | Rides | Manual entry, quick-add form for tablet and phone, bike park fields (total time, descent time, runs) | |
| 5 | Maintenance | Events with items, costs, shop or self | |
| 6 | Rule engine | Wear counters with their sources ("Voir le détail"), rule status (ok / due soon / overdue), ETA projection. Unit-tested | |
| 7 | Tasks | One-off to-dos under "À prévoir", "Fait" with undo (D-34) | |
| 8 | Workshop: parts and restocking | Items, movements, purchase links, online shops (D-37), "À racheter", "En stock pour ce vélo", replace a part from stock, search and bike filter (D-33 to D-42) | |
| 9 | "À prévoir" dashboard | Overdue, due soon, open tasks, "À racheter" | |
| 10 | Attachments | Photos and PDFs: upload (iPhone through Safari first, D-46), thumbnails, viewer, gallery per bike, cover photo, invoices on maintenance events. No labels (D-45) | |
| 11 | Bike page | Counters, tabs below 1024 px and two columns above (D-48), components today / original spec, timeline, total cost per 100 km (D-44) | |
| 12 | Export | One ZIP with CSV/JSON of every table, the uploads and the data dictionary (D-50) | |

**Exit:** the success criteria in [01](01-vision-and-scope.md#mvp-success-criteria), after 2–4
weeks of real use.

## Phase 1.5 — Comfort (optional, in order of need)

- [ ] Notifications (D-18): dedicated Telegram bot (weekly digest + threshold crossed) and a calendar feed (ICS) behind a secret-token URL
- [ ] Setup log per bike (D-24): current setup, dated changes, "restore this setup" view
- [ ] E-bike readings (D-19): typed from the Bosch eBike Flow app, battery capacity and cycles charts
- [ ] Photo labels and the photo search across bikes, in Activité › Photos (D-45)
- [ ] Workshop: products (four levels plus containers, D-36) and tools (D-33): rebuild their screens in `/design` first, from the mockup
- [ ] Maintenance procedures: list, detail, editor, rule → procedure link (D-47; ≈ 3–4 evenings, **Estimate**)
- [ ] Workshop mode: one step at a time, summary, save with undo (D-47; ≈ 2–3 evenings, **Estimate**)
- [ ] Statistics: km and hours per bike per month, cost per bike per year, cost per 100 km over time (D-23, D-44)
- [ ] Search and filters beyond the workshop
- [ ] CSV import (only if H-06 turns out wrong)
- [ ] HTTPS + PWA (only if a domain is bought, see [04](04-architecture.md#behind-a-reverse-proxy))
- [ ] Delete `docs/design/mockups.html` once every 1.5 screen is rebuilt in `/design` (D-53)

## Phase 2 — Garmin (≈ 8–12 evenings, after the spike)

Details and sources: [06-integrations.md](06-integrations.md#garmin).

| Step | Content | Exit |
|------|---------|------|
| 2.0 Spike (1–2 evenings, go/no-go) | Create a Personal API key. **First check whether the bike (gear) assigned in Garmin Connect is exposed** (D-17), in the JSON or in the FIT file. List activities, read one in detail, download one FIT file. Measure how far back history goes, the rate limits and the available fields (activity type, device, laps, gear?). Read the terms, especially on AI use. Write the results into 06 | Decide 2.2–2.5 or fall back |
| 2.1 FIT/GPX upload | Drag and drop a file exported from Garmin Connect, parsed with `@garmin/fitsdk`. Works whatever happens to the API | A ride created from a file |
| 2.2 Activity inbox | `external_activities`, bike assignment rules, confirmation screen | Imported activities on the right bike after one click |
| 2.3 Scheduled sync | Pull every few hours and on demand; duplicates detected against manual rides | No typing for Garmin rides |
| 2.4 Bike park metrics | The Edge 540/840 has no Downhill profile (D-16): runs from manual laps pressed at the top of each run, otherwise descent detection from altitude/speed streams (accuracy is an **Estimate**, check on my own rides) | Bike park fields filled automatically |
| 2.5 History backfill | If the API allows it: import past activities and recompute the counters | Counters that reflect the bikes' real history |
| 2.6 Key expiry | Show the key's expiry date, warn 30 days before | No silent sync stop |

**Exit:** a ride recorded on the Garmin shows up in Bike-Book, on the right bike, within a few
hours and without typing.

**Fallbacks if the Personal API turns out too limited:** FIT upload only (2.1), or
intervals.icu as a hub. The unofficial Garmin libraries are not recommended (see 06).

## Phase 3 — AI (≈ 8–15 evenings)

Details: [07-ai.md](07-ai.md).

| Step | Content | Technique |
|------|---------|-----------|
| 3.1 | Wear weighted by ride type and conditions | Configurable factors, no LLM |
| 3.2 | Personal calibration from the owner's replacement history | Simple statistics, no LLM |
| 3.3 | Spec sheet and service intervals from brand, model and year, with sources, reviewed before import | LLM + web search |
| 3.4 | Service manuals: store the PDFs, extract intervals with citations | LLM on documents |
| 3.5 | Optional: questions in plain language about the data | LLM over structured data |

**Prerequisites:** a local OpenAI-compatible endpoint (D-49), and clean, self-describing data
from phase 1 (D-50): removal reasons, conditions, wear measurements.
