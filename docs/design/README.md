# Design

Status: **Proposed** (2026-10-25), awaiting validation. Once validated, the choices below go into
the decision log ([02](../02-decisions-and-questions.md)) and this status changes.

## Mockups

[`mockups.html`](mockups.html) is one static page. Open it in a browser; it needs an Internet
connection for the fonts and icons. The controls at the top switch:

- the screen: dashboard, bike page, quick ride entry, phase 3 preview, design foundation;
- the frame: auto (follows the window), iPhone, tablet, PC;
- the theme: system, light, dark.

All data is fictitious (D-22). The Foundation screen measures the contrast of every text and
background pair live, in the theme shown.

To try it on a phone, serve this folder on the local network, then open
`http://<computer-address>:8000/mockups.html` on the phone:

```bash
python3 -m http.server 8000 --directory docs/design
```

This file is a reference for validation, not code to maintain. At step A of phase 1 the same
screens are rebuilt in the app, with the real components and fixture data, on a
development-only `/design` route. This file is then deleted (git history keeps it), so the
design has a single source of truth.

**Why HTML rather than draw.io:** the mockup shows real behaviour (responsive layout, dark mode,
touch sizes, the quick-entry sheet) and opens on a phone. draw.io suits flows and architecture
diagrams; these docs already use Mermaid for that, which GitHub renders.

## Direction

| Topic | Proposal |
|-------|----------|
| Accent | Turquoise, like anodised parts (OKLCH hue 205 in light mode, 195 in dark mode). It stays away from the green, amber and red used for wear status, so a button never looks like an alert |
| Neutrals | Slightly blue greys. Light: tinted page, white cards. Dark: near-black page, lighter surfaces instead of shadows |
| Wear status | Up to date (green), due soon (amber), overdue (red), always with an icon and a label. Wear bars show a tick at the warning threshold (90 %) and are hatched beyond 100 %, so status never relies on colour alone |
| Type | Geist for the interface, Barlow Semi Condensed for figures (km, hours, counters) |
| Layout | Mobile first. Under 700 px: bottom tab bar with a central "+" for quick entry. 700–1023 px: icon rail. From 1024 px: full sidebar |
| Navigation | Accueil · Vélos · + · Activité · Tâches; settings and account from the avatar. Activité holds the ride and maintenance log, then statistics (1.5) and analyses (phase 3) |
| States | Empty states that point to the next action, skeletons while loading, a toast after each action (with undo where possible), validation errors under the field |
| Touch | Controls 44–48 px high on touch screens. Inputs use 16 px text at least, or iOS zooms in on focus |
| Motion | 160–280 ms transitions on hover, press and sheets; switched off when the system asks for reduced motion |
| Accessibility | AA contrast on every text/background pair in both themes, visible keyboard focus, a label on every field |

## Quick ride entry

Required: bike, date, one duration (principle 1 in [01](../01-vision-and-scope.md)). Defaults:
the last bike used, today, and the ride type most often used with that bike. Choosing "Bike park"
shows total time, descent time and number of runs, with the D-13 rule in one sentence. Ride
conditions are one optional row of chips on the main form, because phase 3 needs them
([07](../07-ai.md): data to capture from day one).

## Certainty levels (phase 3)

AI comes in phase 3 ([07](../07-ai.md)). How it is shown is fixed now, so phase 1 screens leave
room for it and never mix facts with guesses:

| Level | Comes from | How it looks |
|-------|------------|--------------|
| Computed | Rules and counters (L0) | Plain display |
| Estimated | Projections and statistics (L1–L3) | "≈", an "Estimation" badge and a "Why?" panel listing the data used |
| Suggested | A language model (L4, spec retrieval, questions) | Dashed frame, sparkles icon, "to review". Nothing is saved without approval; spec lines show their source, and lines without one are flagged |

Consequences for phase 1, without building any AI:

- The wear engine (step B) returns its figures together with the rides and rules they come from.
  The "Voir le détail" link needs it now; the "Why?" panel and an LLM's context reuse it later.
- Data-access functions stay scoped by user and workspace (D-25), so they can later be exposed
  to a model as read-only tools without leaking another workspace's data.
