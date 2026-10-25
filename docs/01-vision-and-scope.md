# Vision and scope

## Concept

Bike-Book lists all of a rider's bikes (road, gravel, enduro, DH, e-MTB…) and, for each one, tracks:

- **Rides**: date, place, duration, distance, ride type (e.g. bike park with lifts).
- **Maintenance**: date, what was done, parts replaced, cost, shop or done yourself, invoice.
- **Components**: the stock spec sheet and every replacement part, with its references.
- **What's coming**: services due, one-off tasks, and reminders driven by thresholds
  (hours, kilometres, date).
- **Workshop**: the parts on the shelf and what to rebuy (D-33).

Goal: a good-looking tracker that is pleasant to use every day.

## Usage context (Decided 2026-10-24)

| Question | Answer | Consequence |
|----------|--------|-------------|
| Who uses it | One person, the owner of the bikes, to start with | No public sign-up. Accounts and workspaces exist from day one (D-25), so family, friends or a bike shop's mechanics can be added later without a rewrite |
| On what | Mostly PC and tablet, sometimes a phone | Responsive web app. Layouts designed for tablet and desktop first; the phone must stay comfortable for quick entries. No native app, PWA optional |
| From where | At home, sometimes away | Self-hosted on a private network, reached remotely through a VPN; not exposed to the Internet |
| Ride recording | Garmin records every ride; Komoot only plans routes | Garmin is the only ride source to integrate; no Komoot integration |
| Components | Never moved between bikes | A component belongs to one bike for its whole life, which keeps the model simple |
| Bike park | Count total time, descent time and number of runs | Three optional fields on a ride; wear uses descent time when it is known |
| Files | Photos and PDF invoices | File storage and backups sized for them |

> ⚠ This changes one point of the original brief, which said "mobile first". The answer given
> on 2026-10-24 was "mostly PC and tablet, sometimes a phone". The design target is therefore
> **responsive, tablet and desktop first**, with quick entry that works well on a phone.

## Principles

1. **Fast entry beats exhaustive entry.** Logging a ride takes under 30 seconds. Only the bike,
   the date and one duration are required; everything else is optional.
2. **Numbers you can trust.** Every counter (km, hours, days since the last service) can be
   explained: the app shows which rides and which events it was computed from.
3. **Your data, on your server.** Self-hosted, in one directory that is easy to back up, and
   exportable (CSV/JSON) at any time.
4. **Useful before smart.** Rules and thresholds come first. AI only comes in where it does
   something rules cannot (phase 3).
5. **Pragmatic.** One container, one SQLite file, one uploads folder. No microservices.

## Scope by version

| Area | MVP (phase 1) | Later | Out of scope for now |
|------|---------------|-------|----------------------|
| Bikes | Create/edit, full record (identity, purchase, security, status, total cost per 100 km), photos | Sale or insurance file export; invitations and roles (D-25) | Public sign-up, shop features (customers, quotes) |
| Components | Stock spec + replacements, history per bike, references, warranty | Spec sheets filled by AI (phase 3) | Moving parts between bikes (Decided: never happens) |
| Rides | Manual entry, bike park fields | Garmin import (phase 2), maps | Social features, segments, leaderboards |
| Maintenance | Events with line items, costs, shop or self, invoices | Statistics, cost per km | Booking a shop |
| What's coming | Threshold rules (km, hours, days, whichever comes first), one-off tasks, a "To plan" dashboard, a due-date projection | Telegram notifications, calendar feed, AI predictions (phase 3) | — |
| Workshop | Parts in stock, restocking ("À racheter"), replace a part from stock | Products and tools, maintenance procedures, workshop mode (1.5) | Shop features |
| Integrations | — | Garmin (phase 2) | Komoot, Strava, Apple Health (see [06](06-integrations.md)) |
| Offline use | — (Assumption H-05) | Maybe | — |

## MVP success criteria

- All the owner's bikes, their current main components and the last known services are entered.
- The "To plan" page matches what the owner knows is due, on real data.
- Logging a ride takes less than 30 seconds on the tablet.
- A restore from backup has been tested once, end to end.
