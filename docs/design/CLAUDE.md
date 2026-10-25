# docs/design — working on the mockups

Read [README.md](README.md) first: it holds the design direction (what was decided and why).
This file says how to work on [mockups.html](mockups.html) without breaking it.

## What the mockup is

- One static HTML page used to **validate design ideas before they are built**. It is not
  application code: nothing in `src/` imports it, and nothing here goes into the Docker image.
- Status: validated on 2026-10-25 and recorded in `docs/02-decisions-and-questions.md`
  (D-30 to D-48). The mockup was not updated for the decisions taken at validation (tablet tabs
  D-48, HEIC D-46, run kept in `localStorage` D-47): where they differ, the decisions win.
  New ideas still start as **Proposed** and reach 02 only after the owner validates them.
- Lifecycle: at step A of phase 1 the screens are rebuilt in the app (real components, fixture
  data, a development-only `/design` route). The HTML file is then deleted. Until then, keep it
  coherent and runnable after every change.

## Rules

1. **Public repository (D-22).** Fictitious data only: no real names, places tied to the owner,
   IPs, hostnames, photos or receipts. No external images: "photos" are the SVG/CSS cover
   illustrations (`cover()` in the script).
2. **Languages.** Visible UI text in French, informal "tu", French number formats: narrow
   no-break space for thousands, decimal comma, no-break space before units, "€" after the
   amount (the script's `fr()` helper does this). HTML comments, CSS comments, JS identifiers and
   the README in English.
3. **Tokens only.** Every colour comes from a CSS custom property defined in the bare `:root`
   block and redefined in **both** dark blocks (`@media (prefers-color-scheme: dark)` and
   `:root[data-theme="dark"]`). Never a literal colour in a component rule, except inside cover
   illustrations, which stand in for photos. A new token needs a reason; add it to the
   Foundation screen (`SWATCHES`, and `PAIRS` if text sits on it).
4. **Colour meaning.** Turquoise accent (`--brand*`) for actions, selection and links. Green,
   amber and red (`--ok*`, `--soon*`, `--late*`) are reserved for wear status, always with an
   icon and a label. "Suggested" content (phase 3) uses the dashed frame and sparkles icon, see
   the certainty levels in README.md.
5. **Layout through container queries** on the frame (`container: app`), not media queries, so
   the iPhone / tablet / PC frames work on a desktop screen: under 700 px bottom tab bar,
   700–1023 px icon rail, from 1024 px full sidebar. Media queries are only for the page around
   the frame (controls, Foundation board) and `prefers-reduced-motion`.
6. **Reuse before adding.** Existing building blocks: `.btn` (primary, secondary, ghost, danger,
   sm, lg, block), `.chip`, `.badge`, `.card`, `.list`, `.field` + `.input-wrap`, `.wear`,
   `.tl` (timeline), `.sheet` (bottom sheet on mobile, dialog from 700 px), `toast()`,
   `.empty`, `.sk` (skeleton), `.suggest` (phase 3). Use them before writing new CSS.
7. **Accessibility.** AA contrast in both themes (check on the Foundation screen), a label on
   every field, visible keyboard focus, touch targets of 44 px or more (the `.touch` class is set
   for touch screens and the iPhone/tablet frames), errors under the field with
   `aria-invalid` and `aria-describedby`, transitions switched off by `prefers-reduced-motion`.
8. **No new dependency.** Vanilla JS. Only Google Fonts (Geist, Barlow Semi Condensed) and
   lucide `0.469.0` from jsDelivr are loaded; check that an icon name exists in that version
   before using it (a wrong name renders nothing, silently).
9. **Hidden elements** use the `hidden` attribute (a `[hidden] { display: none !important }`
   rule makes it win over component `display` values), never `style.display`.

## How the file is organised

The file is formatted by Prettier, so line numbers move: search for the section comments
(`/* ---------- Name ---------- */`) instead.

- **`<style>`:** tokens, then one section per area: mockup controls, app shell, buttons/badges/
  fields, bike covers, then one section per screen or pattern (dashboard, timeline, bike page,
  phase 3 preview, skeleton, sheet, toast, empty state, foundation board), with a
  `prefers-reduced-motion` block last.
- **`<body>`:**
  - `.ctl`: the mockup's own controls (screen, frame, theme). They are not part of the app
    design.
  - `#stage` > `#frame` > `#app`: the simulated app (sidebar, topbar, `#main`, bottom nav,
    sheet, toast). Each app screen is a `<section class="screen" data-screen="…">` inside
    `#main`.
  - `#foundation`: the design-system board, shown instead of the frame.
- **`<script>`:** fictitious data as constants (`BIKES`, `DASH_RULES`, `BIKE_RULES`,
  `COMPONENTS`, `HISTORY`, `ACTIVITY`…), render helpers (`cover`, `badge`, `ruleRow`,
  `tlItem`, `render`), then the controls (`setScreen`, `setFrame`, `setTheme`), the sheet,
  `toast()`, one delegated click handler, the quick-entry form, the phase 3 preview, the
  Foundation contrast check, and the init.

Interaction hooks, handled by the delegated click handler:

| Attribute | Effect |
|-----------|--------|
| `data-go="<screen>"` | Navigate inside the app (with a short skeleton) |
| `data-open-sheet` / `data-close-sheet` | Open the quick-entry sheet / close whichever sheet is open (`openSheet(name)` handles `ride`, `item`, `replace`) |
| `data-toast="…"` | Show that message as a toast (inside the app only) |
| `data-todo` | "Écran non maquetté" toast, for links to screens not mocked yet |
| `data-theme-cycle` | Cycle system → light → dark |
| `data-ws-open="<item id>"` | Open a workshop item: full screen under 1024 px, next to the list from 1024 px. With `data-go="ws"`, also navigates to the workshop first |
| `data-ws-tab="<tab>"` | Select a workshop filter (`part`, `product`, `tool`, `restock`); with `data-go="ws"`, applied on arrival |
| `data-ws-bike="<bike id>"` | With `data-go="ws"`: set the workshop's bike filter (`""` for all bikes) |
| `data-ws-back` | Back from an item to the workshop list (top bar crumb) |
| `data-ws-clear` | Clear the workshop search and bike filter |
| `data-add-item` / `data-add-item="<n>"` | Open the "Ajouter un objet" sheet, empty or prefilled from `SUGGESTIONS[n]` |
| `data-replace` / `data-replace="<item id>"` | Open the "Remplacer une pièce" sheet, optionally with that stock item chosen |
| `data-restock="<to>"` + `data-item="<item id>"` | Move an item's restocking state: `to_order`, `ordered`, `received` (adds to the stock) or `none` |
| `data-move="1"` / `data-move="-1"` | On the selected item: record a purchase / a use (containers for products) |
| `data-rq="1"` / `data-rq="-1"` | On the selected item: change the quantity to order, or received (`restockQty`); not a stock movement |
| `data-receive` | With `data-ws-open`: open the item and focus "Marquer reçu", so the quantity is confirmed first |
| `data-task-done="<task id>"` | Mark a one-off task done in "À prévoir" (dashboard, bike page), with undo |
| `data-photo="<id>"` + `data-seq="<list>"` | Open the photo viewer on that photo, browsing the list registered as `SEQ[list]` (gallery, event, component) |
| `data-ph-tag="<label>"` | Photos across all bikes filtered by that label (with `data-go="photos"`, or from a label in the viewer) |
| `data-add-photos="bike"` / `="<event id>"` | Open "Ajouter des photos" for the bike (the element is chosen in the sheet) or for that event; `data-up-tag` proposes a label |
| `data-tag-del` + `data-tagger` | Remove a label from a label field (viewer, upload rows) |
| `data-edit-bike` / `="status"` | Open the bike edit sheet, focus on the name or on the status |
| `data-serial="toggle"` / `="copy"` | Show/hide or copy the frame number |
| `data-pr-open="<procedure id>"` | Open a procedure; with `data-go="procs"`, navigates first. `data-pr-bike` sets the bike filter |
| `data-pr-new` (`="<bike id>"`) / `data-pr-edit` / `data-pr-dup` | Procedure editor: new (optionally for a bike), edit, duplicate |
| `data-run="<procedure id>"` (+ `data-run-bike`) | Start, or resume, workshop mode |
| `data-done-proc` + `data-done-rule` + `data-done-bike` | "C'est fait" on a rule that has a procedure: choice between running it and recording directly |
| `data-add-item="p<n>"` | The add sheet prefilled from `PREFILLS[n]` (something a procedure needs that the workshop lacks) |

The photo viewer and workshop mode are full-screen `.overlay` elements opened with the sheets'
`openSheet()` (`viewer`, `runner`), so they share the inert background, the Tab trap, Escape and
the return of focus (found again by its data attributes if a re-render replaced it). Label fields
are comboboxes (`data-combo`); their keys are handled on `#app`, before the document handler, so
Escape closes the suggestions before the sheet.

Change events (not clicks) drive the workshop filters, search and bike filter, the product level
(`name="lvl"`) and tool possession (`name="own"`). Every stock
change goes through `finish()`, which re-renders the workshop, dashboard and bike page and shows
an undo toast.

## Adding a screen

1. Add a button to the "Écran" control: `<button type="button" data-value="<id>">`.
2. Add `<section class="screen" data-screen="<id>" aria-labelledby="…" hidden>` inside `#main`,
   with a `.page-head` (eyebrow + `h1.page-title`).
3. In `setScreen`, show the right topbar group (one `.tb-group` per screen) and add `<id>` to
   the `valid` list in the init, so `#<id>` deep links work.
4. Point the navigation (sidebar, bottom nav) at it with `data-go`, or mark unbuilt targets with
   `data-todo`.
5. Put its data in constants next to the others and render it from `render()`.
6. Cover the states: empty, loading (skeleton), error, and the success toast.
7. Describe the idea and any data model it implies in README.md, marked **Proposed**, with its
   open questions. Do not edit `02` or `03` before the owner validates.

## Before saying a change is done

```bash
pnpm exec prettier --write docs/design/mockups.html
pnpm format:check
pnpm lint
```

Also check the inline script parses: extract the content of the last `<script>` block to a
temporary file and run `node --check` on it. Then check every new screen in the iPhone and PC
frames, in light and dark themes, and on the Foundation screen check that the contrast table is
all "AA".

## Data kept consistent across screens

Today is Sunday 25 October 2026. Bikes: **Spectral** (Canyon Spectral 29 CF, 2024, enduro,
2 846 km), **Le Lourd** (Orbea Wild H20, 2025, e-MTB, Bosch), **Gravel alu** (Specialized
Diverge E5, 2022). The owner is the fictitious demo user Camille Martin, garage "Mon garage".
New data must agree with what other screens already show (dates, counters, parts fitted,
weekdays).
