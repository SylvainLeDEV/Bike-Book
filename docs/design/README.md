# Design

Status: **Decided** (2026-10-25): validated on the mockup and recorded in the decision log
([02](../02-decisions-and-questions.md), D-30 to D-48). Where the mockup and the decisions differ
(tablet tabs D-48, HEIC D-46, run kept in `localStorage` D-47), the decisions win.

## Mockups

[`mockups.html`](mockups.html) is one static page. Open it in a browser; it needs an Internet
connection for the fonts and icons. The controls at the top switch:

- the screen: dashboard, bike page, workshop ("Atelier", see
  [Workshop and inventory](#workshop-and-inventory)), maintenance procedures and photos
  across all bikes (see
  [Bike record, original spec, photo labels and maintenance procedures](#bike-record-original-spec-photo-labels-and-maintenance-procedures)),
  quick ride entry, phase 3 preview, design foundation;
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

| Topic | Decision (D-30, D-31) |
|-------|----------|
| Accent | Turquoise, like anodised parts (OKLCH hue 205 in light mode, 195 in dark mode). It stays away from the green, amber and red used for wear status, so a button never looks like an alert |
| Neutrals | Slightly blue greys. Light: tinted page, white cards. Dark: near-black page, lighter surfaces instead of shadows |
| Wear status | Up to date (green), due soon (amber), overdue (red), always with an icon and a label. Wear bars show a tick at the warning threshold (90 %) and are hatched beyond 100 %, so status never relies on colour alone |
| Type | Geist for the interface, Barlow Semi Condensed for figures (km, hours, counters) |
| Layout | Mobile first. Under 700 px: bottom tab bar with a central "+" for quick entry. 700–1023 px: icon rail. From 1024 px: full sidebar |
| Themes | Light and dark from phase 1, following the system setting, with a manual override (D-31) |
| Navigation | Accueil · Vélos · + · Activité · Atelier; settings and account from the avatar. Activité holds the ride and maintenance log, then statistics (1.5) and analyses (phase 3). Atelier (D-33, it replaces "Tâches") holds the inventory, see [below](#workshop-and-inventory); one-off tasks join the rules under "À prévoir" |
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

## Workshop and inventory

Status: **Decided** (2026-10-25, D-33 to D-42), shown on the mockup's "Atelier" screen. Phase 1:
parts, restocking, search and bike filter. Phase 1.5: products and tools.

### Concept

The workshop is the garage's inventory, owned by the workspace (D-25). Each item is tracked the
way it is actually used:

| Kind | Tracked as | Examples | "Stock bas" when |
|------|------------|----------|------------------|
| Part | Exact quantity and a unit (piece, pair, set) | Brake pads, chain, seal kit, inner tube | Quantity ≤ the item's alert level |
| Product | Level of the open container (full, started, nearly empty, empty) and the number of containers | Grease, brake fluid (DOT or mineral oil), tubeless sealant, fork oil | The last container is nearly empty, or none is left |
| Tool | Owned or not | Torque wrench, bleed kit, chain tool | Never; a tool not owned can be put on the "to buy" list |

Every item has a name, brand, reference, category (the component groups of the bike page, plus
"care" and "general"), a storage place (free text), an optional photo, notes and any number of
purchase links (shop, address, price, last purchase). It serves no bike, some bikes, or all bikes
(future bikes included).

Rules the mockup follows:

- **Stock moves by movements, never by a typed total.** "−" on the item page records a use, "+"
  a purchase; after a count, "Corriger le stock" records the difference as an adjustment. Each
  change shows a toast with undo.
- **Restocking replaces "parts to order".** An item goes `to_order` → `ordered` → received;
  the quantity is set when ordering and confirmed at reception, which records a purchase and
  adds to the stock. Low-stock items also show up in "À
  racheter" by themselves, in a "Stock bas · pas encore prévu" group, without being ordered.
- **Purchase links are displayed only.** Prices are typed by hand, and the app never fetches a
  shop page (private network, D-09). In the app, links open in a new tab with
  `rel="noopener noreferrer"`.
- **Replacing a part starts from the stock.** The sheet lists the items of the same slot type,
  linked to the bike and in stock; choosing one decrements the stock and prefills the new
  component (brand, model, reference, last purchase price). "Autre pièce, hors atelier" stays
  possible.
- **Items meet rules through the slot type.** An item with a component type serves the rules of
  that slot on its bikes: the sealant lists "Ajout de liquide préventif" on the Spectral, and that
  rule's row shows "Préventif : vide · à commander".
- **Colour.** Restocking states use the accent and the neutrals only, each with its own icon and
  label: "À commander" (outline), "En commande" (accent), "Stock bas" (neutral). Green, amber and
  red stay reserved for wear; inside the workshop they only appear on the badges of the rules an
  item serves.

### Navigation and screens

| Place | What the mockup shows |
|-------|-----------------------|
| Navigation | "Tâches" becomes "Atelier" (lucide `warehouse`) in the bottom bar, the rail and the sidebar |
| Tasks | Out of the workshop: one-off tasks sit under "À prévoir", on the dashboard (all of them) and on the bike page (that bike's), after the rules. Same row as a rule without the wear bar, a neutral "Tâche" badge, the due date or "Sans échéance", and a "Fait" button with undo |
| Atelier | One summary line ("2 en stock bas · 1 en commande · 3 à commander") that leads to "À racheter", then filter chips: Pièces · Produits · Outils · À racheter, with counts. Search (name, brand, reference, category, storage place) and a bike filter. Rows are grouped by category (by status in "À racheter"): thumbnail (photo, else the category icon), name, bike pastilles with the bike names, quantity, level or possession, and at most one badge |
| Item page | Stock with −/+ and the alert level, or level and containers, or possession; restocking steps; bikes; purchase links with the cheapest one marked; maintenance concerned (rules of the slot, last use); movement history linking to the maintenance event; notes. Under 1024 px it replaces the list, with "‹ Atelier" in the top bar; from 1024 px the list and the item sit side by side, and the item stays in view while the list scrolls |
| Add sheet | The type comes first (three cards), then a short form for that type; storage place, photo, purchase link and notes are folded away. Bikes are chosen with chips, "Tous les vélos" being exclusive |
| Dashboard | "À racheter" (formerly "Pièces à commander") lists everything to rebuy, parts, products and tools, the most urgent first: an item needed by a late or due-soon rule ("nécessaire le 1er novembre"), then to order, ordered, low stock. Five rows and "Tout voir (6)". The sealant rule shows its stock line |
| Bike page | "En stock pour ce vélo" (in the "Composants" tab on phones): what is on the shelf for that bike, alerts first, the storage place on each row, and the number of items to rebuy |
| Replace a part | A sketch of the sheet: part removed, reason, part fitted chosen from the workshop first, the effect on the stock spelled out before saving |
| States | Guided empty workshop (suggestions open the add sheet prefilled), item without a purchase link, empty product, no match, nothing to rebuy |

### Data model

Recorded in [03](../03-data-model.md#workshop-d-33-to-d-42): `inventory_items`,
`inventory_item_bikes`, `inventory_movements` and `purchase_links`, with `shops.kind`,
`components.inventory_item_id`, `attachments.inventory_item_id`, and `tasks` without its part
fields. The flows (replace a part from stock, received, bleed) are described there too.

### Answers (2026-10-25)

Recorded in [02](../02-decisions-and-questions.md#decision-log).

| # | Question | Answer |
|---|----------|--------|
| W1 | Phase 1 or 1.5? | Parts and restocking in phase 1, products and tools in 1.5; the tables are created complete in phase 1 (D-33) |
| W2 | Where do tasks go? | Out of the workshop: one-off to-dos under "À prévoir", after the rules (D-34) |
| W3 | Does low stock set `to_order`? | No, it stays a suggestion (D-35) |
| W4 | Product levels? | Four levels plus a container count (D-36) |
| W5 | Online shops? | `shops` rows with a `kind` (D-37) |
| W6 | Cost of a part taken from stock? | Last purchase price, editable (D-38) |
| W7 | Stored or computed quantities? | Computed from movements (D-39) |
| W8 | Tools recorded per job? | No (D-40) |
| W9 | Dashboard? | Everything to rebuy, most urgent first (D-41) |
| W10 | Received quantity? | Set when ordering, prefilled and correctable at reception (D-42) |

## Bike record, original spec, photo labels and maintenance procedures

Status: **Decided** (2026-10-25, D-43 to D-48), shown on the mockup's bike page and on the
"Fiches d'entretien" and "Photos" screens. Phase 1: the record with its total cost, the original
spec, photos and PDFs without labels (gallery per bike, viewer, add photos). Phase 1.5: labels,
photos across all bikes, maintenance procedures, then workshop mode.

Four ideas, mocked before any implementation: the bike's full record, its original spec sheet,
photos with labels, and maintenance procedures written by the owner (reusable how-tos, distinct
from the maintenance events they produce).

### What the mockup shows

| Place | What the mockup shows |
|-------|-----------------------|
| Bike page, layout | Phone: five tabs, À prévoir · Composants · Historique · Fiche · Photos; the bar scrolls sideways when the labels do not fit, arrow keys move between tabs. Tablet (700–1023 px): the same tabs (D-48; the mockup stacks every section there). From 1024 px: two columns, the record at the top of the right column above the history; procedures, components, stock and photos in the left one |
| Fiche (record) | Four cards. Identity: brand, model, year, discipline, size, wheels, colour, weight, e-bike or not. Purchase: date, price, shop, new or used, distance and hours at purchase. Security: frame number masked except its last group, "Afficher" (pressed state) and "Copier", the photo labelled "numéro de série"; invoices and documents (PDF) with "Joindre un document"; status (active, stored, sold, stolen, retired) with "Changer". Total cost: purchase + shop visits + parts fitted at home, per 100 km with and without the purchase, and "Voir le calcul" with the formula and the nine events it adds up |
| Edit sheet (sketch) | "Modifier" (section head and the top bar pencil): name, brand, model, year, discipline, e-bike and status visible; "Détails" and "Achat" folded. Choosing "Vendu" shows the sale date and price; each status explains its effect in one line |
| Composants | A toggle "Monté aujourd'hui" / "Fiche d'origine". The original spec lists each slot's purchase part, then every replacement in order: when, after how much wear, the removal reason and its detail ("Chute : chape tordue aux Gets"), down to the part fitted today. Slots never replaced say "D'origine · toujours en place". Parts with photos show thumbnails, removed parts included |
| Photos (gallery) | One gallery per bike: photos of the bike, its components, its maintenance events and its rides, grouped by month, newest first. Each tile names its origin ("Entretien du 12 oct.") and its number of labels. Filters: label chips with counts, origin, sort by date taken. A link opens the same search across all bikes |
| Viewer | Full screen: the photo, its caption (editable in place), the date taken, the linked element with a link to it, the bike, the labels (removable chips plus the label field), delete with undo. Previous/next by buttons, arrow keys and swipe; Escape closes; focus returns to the thumbnail that opened it, even after a re-render. Without a caption, it shows the generated alternative text |
| Add photos | From the gallery ("Lier à" chooses the element) or from a maintenance event in the history (link fixed). Several files at once (iPhone: camera or library). Each file uploads at once with its own progress bar, while its caption and labels are typed; iPhone photos are accepted, HEIC included (D-46); refused files explain why (over 25 MB, unsupported format) and offer "Choisir une autre photo" or "Retirer". Saving waits for the uploads in progress |
| Labels | Field with suggestions (combobox): existing labels match whatever the case or accents, so "Avant" picks "avant"; "Créer « … »" is the last suggestion when nothing matches exactly. Keyboard: arrows, Enter, Escape. Example set: avant, après, couple de serrage, réglage, casse, garantie, numéro de série, facture |
| History | Thumbnails on the events that have photos; "Photos" on maintenance events adds some to that event |
| Photos across all bikes | Phase 1.5: **Activité › Photos** (Activité already holds the ride and maintenance log). Reached from any label in the viewer and from the bike gallery; label search field, label chips, bike, origin and sort filters, results grouped by bike |
| Procedures list | Entry in the Atelier (a summary line under the restocking one: "4 fiches d'entretien · 1 avec du matériel manquant") and a "Fiches d'entretien" section on the bike page (the bike's procedures, "Nouvelle fiche pour ce vélo"). Search (title, steps, items), filters by bike and component type. Each row: steps, bikes, duration, and one readiness badge (ready, stock bas, n manquants) |
| Procedure detail | Title, description, type and model, duration, difficulty (three segments plus a word), bikes, "Dupliquée de …" when it is a copy. "Lancer la fiche", "Modifier", "Dupliquer". For several bikes, "Préparer pour" picks the bike, which drives availability and the rule. A readiness note, the linked rule with its status, the needed items grouped by tools, wear parts (quantity per job) and products, each with its availability in words and an icon ("Possédé", "1 lot en stock", "Stock bas · presque vide", "Manquant", "Pas dans l'atelier"), and an action: "Ajouter aux achats" (sets `to_order`), "Ajouter à l'atelier", or the restocking badge already set. Then the ordered steps (text, note, torque, reference photo) and the resources: video as a link card (title and duration typed), PDF manual, web link, free note |
| Editor | Sheet: title, description, bikes (chips, "Tous les vélos" exclusive), component type and model, duration, difficulty, rule reset at the end, steps (instruction, torque, note, reference photo) reordered by dragging the handle or with ↑ ↓ buttons (announced), items picked from the workshop with a quantity for parts, resources. Duplicate opens a copy with no bike chosen |
| Rules | A rule row shows "Fiche : …" when a procedure points to it. On the dashboard, "C'est fait" on such a rule opens a choice: "Lancer la fiche" or "Enregistrer directement" |
| Workshop mode | Full screen, one step at a time in large type, the torque in large figures, the reference photo, a large "Étape faite" box, "Prendre une photo", progress (current step and steps done), "Ressources" panel (resources and items). Previous/next by buttons, arrow keys, swipe; closing pauses the run, kept in `localStorage` (D-47), "Reprendre à l'étape n" resumes it. The summary lists what will be written before anything is: the event (date, bike, lines), stock changes (part quantities adjustable, product level after the job), cost (parts at last purchase price, editable), time spent, photos taken, the rule reset; unchecked steps are pointed out. Saving writes everything at once, with undo |
| States | Bike without photos (guided: "Numéro de cadre", "Facture d'achat", "Le vélo en entier"), upload in progress, upload refused, no procedure (guided), procedure with a missing part or product, no photo matching the filters, no procedure matching the filters |

Mockup notes:

- **Le Lourd's brakes.** The brief asked for "Purge des freins SRAM Maven" on the Spectral and
  Le Lourd, but the existing data gives Le Lourd Shimano brakes (N04C pads, Shimano oil and bleed
  kit). The Maven procedure therefore targets the Spectral, and "Purge des freins Shimano"
  (Le Lourd, Gravel alu) is its duplicate, which also shows duplication at work.
- **Figures.** The nine costed events of the Spectral add up to 1 284,00 € and 45 € per 100 km, the
  figures of the phase 3 preview. Component lineages add up to the bike's 2 846 km.
- **Steps and torque values are invented** for the mockup; the stage note says so. They are not
  manufacturer figures.
- **Colour.** Availability uses neutrals and the accent, with words and icons; green, amber and
  red still only appear on rule badges. No new token.

### Data model

Recorded in [03](../03-data-model.md). The bike record and the original spec need no new table:
`components` gains `removal_note` (D-43), and the total cost is computed
([Total cost](../03-data-model.md#total-cost-d-44)). Labels and procedures are in
[Phase 1.5 additions](../03-data-model.md#phase-15-additions-labels-maintenance-procedures).
Uploads follow [04](../04-architecture.md) and D-46: streaming Route Handler, type checked from
the content, random file names, 25 MB per file, originals plus resized copies (D-20), one request
per file for per-file progress.

### Answers (2026-10-25)

Recorded in [02](../02-decisions-and-questions.md#decision-log).

| # | Question | Answer |
|---|----------|--------|
| P1 | Labels on what? | Photos only (D-45) |
| P2 | A photo linked to several elements? | No, exactly one (D-45) |
| P3 | Procedures shipped with the app? | No, the owner's only; the examples are demo data (D-47) |
| P4 | Workshop mode in the MVP? | No, phase 1.5, after the procedures (D-47) |
| P5 | Video player? | Link card, never an embedded player (D-47) |
| P6 | Run in progress kept where? | In the browser's `localStorage` (D-47). The mockup only keeps it while the page stays open |
| P7 | Cost per 100 or 1,000 km, phase 1 or 1.5? | Per 100 km, with and without the purchase, sale price deducted, phase 1 (D-44) |
| P8 | Product level after a procedure? | One level down by default, adjustable in the summary (D-47) |
| P9 | HEIC? | iPhone photos sent from Safari must upload: Safari converts to JPEG, and a HEIC that still arrives is accepted (D-46). The mockup refused HEIC |
| P10 | Tablet layout? | Tabs below 1024 px (D-48). The mockup stacks the sections from 700 px |
| P11 | When does "C'est fait" offer the procedure? | Only on due-soon and overdue rules (D-47) |
