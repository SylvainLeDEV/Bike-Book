"use client";

import * as React from "react";
import { cn } from "cn";
import {
  ChevronRight,
  ListOrdered,
  PackageCheck,
  PackageMinus,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";
import { CATEGORY_ICONS } from "@/components/icons";
import { EmptyState } from "@/components/empty-state";
import { ProcedureDetail, type ProcedureActions } from "@/components/procedures/procedure-detail";
import { ProcedureRowContent } from "@/components/procedures/procedure-row";
import { useShell } from "@/components/shell/shell-context";
import { Crumb, PageBody, Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, ChipCount, ChipRow } from "@/components/ui/chip";
import { Input, NativeSelect } from "@/components/ui/field";
import { replaceQuery } from "@/lib/address";
import { formatMoney } from "@/lib/format";
import { INVENTORY_CATEGORY_LABELS } from "@/lib/labels";
import { procedureMatches, procedureRow, procedureServes } from "@/lib/procedures";
import type {
  InventoryCategory,
  InventoryItemVM,
  InventoryKind,
  RebuyState,
  WorkshopVM,
} from "@/lib/view-models";
import { kindTab, writeWorkshopView, type WorkshopTab } from "@/lib/workshop-filter";
import type { AddItemPrefill } from "./add-item-sheet";
import { InventoryRowContent, inventoryRowClasses } from "./inventory-row";
import { ItemDetail, type ItemActions } from "./item-detail";

export type { WorkshopTab };

export type WorkshopActions = ItemActions & {
  onAddItem?: (prefill?: AddItemPrefill) => void;
  /** "Nouvelle fiche" (D-86). */
  onNewProcedure?: () => void;
  procedure?: ProcedureActions;
};

const PROCEDURE_ART = (
  <svg viewBox="0 0 120 70" aria-hidden focusable="false">
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="34" y="8" width="52" height="60" rx="6" />
      <path d="M50 8 V4 H70 V8" />
      <path d="M44 24 l4 4 l7 -8 M60 25 H76 M44 40 l4 4 l7 -8 M60 41 H76 M46 56 H54 M60 56 H76" />
    </g>
  </svg>
);

const TAB_KINDS: Partial<Record<WorkshopTab, InventoryKind>> = {
  parts: "part",
  products: "product",
  tools: "tool",
};

/** An empty tab, without filters: what goes there, and a button to add one. */
const EMPTY_TABS: Record<
  "products" | "tools",
  { title: string; text: string; add: string; kind: InventoryKind }
> = {
  products: {
    title: "Aucun produit",
    text: "Huile, graisse, liquide préventif : note le niveau du contenant entamé d'un coup d'œil.",
    add: "Ajouter un produit",
    kind: "product",
  },
  tools: {
    title: "Aucun outil",
    text: "Clé dynamométrique, kit de purge, dérive-chaîne : note ceux que tu as et ceux à acheter.",
    add: "Ajouter un outil",
    kind: "tool",
  },
};

const CATEGORY_ORDER: InventoryCategory[] = [
  "brakes",
  "drivetrain",
  "suspension",
  "wheels",
  "frame",
  "cockpit",
  "electric",
  "care",
  "other",
];

const REBUY_GROUPS: { state: RebuyState; label: string; icon: typeof Truck }[] = [
  { state: "to_order", label: "À commander", icon: ShoppingCart },
  { state: "ordered", label: "En commande", icon: Truck },
  { state: "low_stock", label: "Stock bas · pas encore prévu", icon: PackageMinus },
];

/** The guided empty workshop's suggestions (the mockup's), each opening the sheet prefilled. */
const SUGGESTIONS: (AddItemPrefill & { name: string })[] = [
  { kind: "part", name: "Plaquettes de frein", category: "brakes", unit: "pair" },
  { kind: "part", name: "Chaîne", category: "drivetrain", unit: "piece" },
  { kind: "product", name: "Liquide préventif tubeless", category: "wheels" },
  { kind: "product", name: "Huile de frein", category: "brakes" },
  { kind: "tool", name: "Clé dynamométrique", category: "other" },
];

/** Accents and case ignored: "derailleur" finds "Dérailleur". */
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function cheapestLink(item: InventoryItemVM) {
  return item.purchaseLinks
    .filter((link) => link.priceCents != null)
    .reduce<InventoryItemVM["purchaseLinks"][number] | null>(
      (best, link) => (!best || (link.priceCents ?? 0) < (best.priceCents ?? 0) ? link : best),
      null,
    );
}

const SHELF_ART = (
  <svg viewBox="0 0 120 70" aria-hidden focusable="false">
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8 V64 M108 8 V64 M12 36 H108 M12 64 H108" />
      <rect x="22" y="16" width="26" height="20" rx="2" />
      <path d="M35 16 V23" />
      <path d="M66 36 V25 Q66 21 70 20 V14 H76 V20 Q80 21 80 25 V36" />
      <circle cx="38" cy="54" r="8" />
      <circle cx="38" cy="54" r="3" />
      <rect x="66" y="46" width="22" height="18" rx="3" />
    </g>
  </svg>
);

/**
 * The workshop (D-33, D-85): a summary line that leads to "À racheter", the Pièces · Produits ·
 * Outils · À racheter filters, search and a bike filter, rows grouped by category (by state in
 * "À racheter"). Under 1024 px an item replaces the list; from 1024 px they sit side by side.
 * The tab, bike, search and open item are kept in the address.
 */
export function WorkshopScreen({
  vm,
  actions,
  bikeHref,
  initial,
  focusProcedure,
}: {
  vm: WorkshopVM;
  actions: WorkshopActions;
  bikeHref: (bikeId: number) => string;
  initial?: {
    /** Null: the tab of the item open, else "Pièces". */
    tab?: WorkshopTab | null;
    bikeId?: number | null;
    query?: string;
    itemId?: number | null;
    procedureId?: number | null;
    receive?: boolean;
  };
  /**
   * A procedure just saved: shown at once; `id` null after a delete: back to the list (`n`
   * changes for each signal).
   */
  focusProcedure?: { id: number | null; n: number } | null;
}) {
  const { user } = useShell();
  const procedures = React.useMemo(() => vm.procedures ?? [], [vm.procedures]);
  const initialItem = vm.items.find((item) => item.id === initial?.itemId) ?? null;
  const initialProcedure = procedures.find((p) => p.id === initial?.procedureId) ?? null;
  const [tab, setTabState] = React.useState<WorkshopTab>(
    initial?.tab ??
      (initialItem ? kindTab(initialItem.kind) : initialProcedure ? "procedures" : "parts"),
  );
  const [query, setQuery] = React.useState(initial?.query ?? "");
  const [bikeId, setBikeId] = React.useState<number | null>(initial?.bikeId ?? null);
  const [selectedId, setSelectedId] = React.useState<number | null>(initialItem?.id ?? null);
  const [selectedProcedureId, setSelectedProcedureId] = React.useState<number | null>(
    initialProcedure?.id ?? null,
  );
  const [typeFilter, setTypeFilter] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(Boolean(initialProcedure?.archived));
  // Phone and tablet: the list, or one item in its place.
  const [view, setView] = React.useState<"list" | "item">(
    (tab === "procedures" ? initialProcedure : initialItem) ? "item" : "list",
  );
  // A procedure just saved: its tab, opened (state adjusted while rendering, not in an effect).
  const [seenFocus, setSeenFocus] = React.useState(focusProcedure ?? null);
  if (focusProcedure && focusProcedure !== seenFocus) {
    setSeenFocus(focusProcedure);
    setTabState("procedures");
    setSelectedProcedureId(focusProcedure.id);
    setView(focusProcedure.id == null ? "list" : "item");
  }
  const isProcedures = tab === "procedures";
  const [focusReceive, setFocusReceive] = React.useState(Boolean(initial?.receive));
  const listRef = React.useRef<HTMLDivElement>(null);

  const passes = (item: InventoryItemVM) => {
    if (bikeId != null && item.bikes !== "all" && !item.bikes.some((b) => b.id === bikeId))
      return false;
    const q = normalize(query.trim());
    if (!q) return true;
    const haystack = [
      item.name,
      item.brand,
      item.reference,
      INVENTORY_CATEGORY_LABELS[item.category],
      item.location,
    ]
      .filter(Boolean)
      .join(" ");
    return normalize(haystack).includes(q);
  };
  const inTab = (item: InventoryItemVM, t: WorkshopTab) =>
    t === "rebuy" ? item.state !== null : item.kind === TAB_KINDS[t];
  const visible = (t: WorkshopTab) => vm.items.filter((item) => inTab(item, t) && passes(item));
  const list = visible(tab);
  // Rows grouped by state in "À racheter", by category elsewhere.
  const groups =
    tab === "rebuy"
      ? REBUY_GROUPS.map((g) => ({
          key: g.state,
          label: g.label,
          Icon: g.icon,
          items: list.filter((i) => i.state === g.state),
        }))
      : CATEGORY_ORDER.map((c) => ({
          key: c,
          label: INVENTORY_CATEGORY_LABELS[c],
          Icon: CATEGORY_ICONS[c],
          items: list.filter((i) => i.category === c),
        }));
  // An item opened stays shown; otherwise the list's selection, else its first row shown.
  const selected =
    (view === "item"
      ? vm.items.find((item) => item.id === selectedId)
      : (list.find((item) => item.id === selectedId) ??
        groups.find((g) => g.items.length)?.items[0])) ?? null;

  // The "Fiches" tab (D-86): search, bike, part type; archived ones on request.
  const procedurePasses = (p: (typeof procedures)[number]) =>
    (bikeId == null || procedureServes(p, bikeId)) &&
    (!typeFilter || p.componentTypeCode === typeFilter) &&
    procedureMatches(p, query, vm.items);
  const procedureList = procedures
    .filter((p) => (showArchived || !p.archived) && procedurePasses(p))
    .sort(
      (a, b) => Number(a.archived) - Number(b.archived) || a.title.localeCompare(b.title, "fr"),
    );
  const archivedCount = procedures.filter((p) => p.archived).length;
  const procedureTypes = [
    ...new Map(
      procedures
        .filter((p) => p.componentTypeCode && p.typeLabel)
        .map((p) => [p.componentTypeCode!, p.typeLabel!]),
    ),
  ].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const selectedProcedure =
    (view === "item"
      ? procedures.find((p) => p.id === selectedProcedureId)
      : (procedureList.find((p) => p.id === selectedProcedureId) ?? procedureList[0])) ?? null;

  // The view lives in the address, rewritten in place (D-85, D-86): a reload shows the same.
  React.useEffect(() => {
    replaceQuery((params) =>
      writeWorkshopView(params, {
        tab,
        bikeId,
        query,
        itemId: !isProcedures && view === "item" ? selectedId : null,
        procedureId: isProcedures && view === "item" ? selectedProcedureId : null,
      }),
    );
  }, [tab, isProcedures, bikeId, query, view, selectedId, selectedProcedureId]);

  /** A filter changed: back to the list, whose first item shows beside it from 1024 px. */
  function setTab(next: WorkshopTab) {
    setTabState(next);
    setView("list");
  }

  const count = (state: RebuyState) => vm.items.filter((item) => item.state === state).length;
  const summary = [
    [count("low_stock"), "en stock bas"],
    [count("ordered"), "en commande"],
    [count("to_order"), "à commander"],
  ].filter(([n]) => n) as [number, string][];

  function open(id: number, options: { receive?: boolean } = {}) {
    setSelectedId(id);
    setView("item");
    setFocusReceive(Boolean(options.receive));
    // Phone and tablet: the item replaces the list, so start at the top with its title.
    if (window.matchMedia("(max-width: 1023px)").matches && !options.receive) {
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() =>
        document.getElementById("item-title")?.focus({ preventScroll: true }),
      );
    }
  }

  function openProcedure(id: number) {
    setSelectedProcedureId(id);
    setView("item");
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() =>
        document.getElementById("procedure-title")?.focus({ preventScroll: true }),
      );
    }
  }

  /** From a procedure's material: the item, in its own tab. */
  function openItemFromProcedure(itemId: number) {
    const item = vm.items.find((i) => i.id === itemId);
    if (!item) return;
    setTabState(kindTab(item.kind));
    open(item.id);
  }

  function back() {
    setView("list");
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(
        isProcedures
          ? `[data-procedure-id="${selectedProcedure?.id}"]`
          : `[data-item-id="${selected?.id}"]`,
      );
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: "nearest" });
    });
  }

  function clearFilters() {
    setQuery("");
    setBikeId(null);
    setTypeFilter("");
    setView("list");
  }

  const noItems = vm.items.length === 0;
  const empty = noItems && procedures.length === 0;
  const filtered = Boolean(query.trim()) || bikeId != null || (isProcedures && Boolean(typeFilter));

  const row = (item: InventoryItemVM, withAction: boolean) => {
    const link = withAction ? cheapestLink(item) : null;
    const action = withAction ? rowAction(item) : null;
    return (
      <li
        key={item.id}
        className={cn(
          action && "md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:block",
        )}
      >
        <button
          type="button"
          data-item-id={item.id}
          aria-current={item.id === selected?.id ? "true" : undefined}
          onClick={() => open(item.id)}
          className={cn(
            inventoryRowClasses,
            "lg:aria-[current=true]:bg-brand-soft lg:aria-[current=true]:[--pip-ring:var(--brand-soft)]",
          )}
        >
          <InventoryRowContent
            row={item}
            allBikes={vm.bikes}
            showBadge={!withAction}
            extra={
              withAction
                ? link
                  ? `${link.shopName} · ${formatMoney(link.priceCents ?? 0)}`
                  : "Aucun lien d'achat"
                : undefined
            }
          />
        </button>
        {action ? (
          <div className="-mt-0.5 flex gap-2 pr-4 pb-3 pl-16 md:m-0 md:p-0 md:pr-4 lg:-mt-0.5 lg:pr-4 lg:pb-3 lg:pl-16">
            {action}
          </div>
        ) : null}
      </li>
    );
  };

  function rowAction(item: InventoryItemVM) {
    // A tool comes one at a time: "Reçu" at once; parts and products confirm the quantity.
    if (item.state === "ordered" && item.kind === "tool")
      return (
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Marquer ${item.name} comme reçu`}
          onClick={() => actions.onRestock?.(item, "received", 1)}
        >
          <PackageCheck />
          Reçu
        </Button>
      );
    if (item.state === "ordered")
      return (
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Noter la réception de ${item.name}`}
          onClick={() => open(item.id, { receive: true })}
        >
          <PackageCheck />
          Reçu…
        </Button>
      );
    const [to, Icon, label, verb] =
      item.state === "to_order"
        ? (["ordered", Truck, "Commandé", "comme commandé"] as const)
        : (["to_order", ShoppingCart, "À commander", "à commander"] as const);
    return (
      <Button
        variant="secondary"
        size="sm"
        aria-label={`Marquer ${item.name} ${verb}`}
        onClick={() => actions.onRestock?.(item, to, item.restock.quantity ?? 1)}
      >
        <Icon />
        {label}
      </Button>
    );
  }

  let body: React.ReactNode;
  if (isProcedures) {
    body = !procedures.length ? (
      <EmptyState
        art={PROCEDURE_ART}
        title="Aucune fiche d'entretien"
        action={
          <>
            <Button onClick={() => actions.onNewProcedure?.()}>
              <Plus />
              Créer ma première fiche
            </Button>
            <p className="hint">Une règle ou une tâche pourra ensuite pointer vers sa fiche.</p>
          </>
        }
      >
        Écris une fois comment tu fais une purge ou un entretien de fourche : les étapes, le
        matériel de l&apos;atelier, les couples de serrage de ton manuel.
      </EmptyState>
    ) : (
      <>
        {procedureList.length ? (
          <Card asChild className="overflow-hidden">
            <ul className="m-0 list-none divide-y divide-border p-0">
              {procedureList.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    data-procedure-id={p.id}
                    aria-current={p.id === selectedProcedure?.id ? "true" : undefined}
                    onClick={() => openProcedure(p.id)}
                    className={cn(
                      inventoryRowClasses,
                      "lg:aria-[current=true]:bg-brand-soft lg:aria-[current=true]:[--pip-ring:var(--brand-soft)]",
                    )}
                  >
                    <ProcedureRowContent
                      row={procedureRow(p, vm.items, bikeId, vm.bikes)}
                      allBikes={vm.bikes}
                      archived={p.archived}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState
            compact
            title="Aucune fiche ne correspond"
            action={
              filtered ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  <X />
                  Effacer les filtres
                </Button>
              ) : null
            }
          >
            Essaie un autre mot, un autre vélo ou un autre type de pièce.
          </EmptyState>
        )}
        {archivedCount ? (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={showArchived}
              onClick={() => {
                setShowArchived((on) => !on);
                setView("list");
              }}
            >
              {showArchived
                ? "Masquer les fiches archivées"
                : `Voir les fiches archivées (${archivedCount})`}
            </Button>
          </div>
        ) : null}
      </>
    );
  } else if (noItems) {
    body = (
      <EmptyState
        art={SHELF_ART}
        title="Ton atelier est vide"
        action={
          <>
            <Button onClick={() => actions.onAddItem?.()}>
              <Plus />
              Ajouter un objet
            </Button>
            <p className="hint">Ou commence par ce qui s&apos;use vite :</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion.name}
                  variant="secondary"
                  size="sm"
                  onClick={() => actions.onAddItem?.(suggestion)}
                >
                  {suggestion.name}
                </Button>
              ))}
            </div>
          </>
        }
      >
        Note ce que tu as en réserve. Le stock baisse tout seul quand tu montes une pièce, et
        l&apos;accueil te prévient quand il faut racheter.
      </EmptyState>
    );
  } else if (!list.length) {
    const emptyTab = tab === "products" || tab === "tools" ? EMPTY_TABS[tab] : null;
    body =
      tab === "rebuy" && !filtered ? (
        <EmptyState compact title="Rien à racheter">
          Les objets sous leur seuil d&apos;alerte arriveront ici tout seuls.
        </EmptyState>
      ) : emptyTab && !filtered ? (
        <EmptyState
          compact
          title={emptyTab.title}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => actions.onAddItem?.({ kind: emptyTab.kind })}
            >
              <Plus />
              {emptyTab.add}
            </Button>
          }
        >
          {emptyTab.text}
        </EmptyState>
      ) : (
        <EmptyState
          compact
          title="Aucun objet ne correspond"
          action={
            filtered ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                <X />
                Effacer les filtres
              </Button>
            ) : null
          }
        >
          Essaie un autre mot ou un autre vélo.
        </EmptyState>
      );
  } else {
    body = (
      <Card className="overflow-hidden">
        {groups
          .filter((g) => g.items.length)
          .map(({ key, label, Icon, items }, index) => (
            <div key={key} className={cn(index > 0 && "border-t border-border")}>
              <h2 className="flex items-center gap-2 px-4 pt-3.5 pb-1.5 eyebrow [&_svg]:size-[15px]">
                <Icon aria-hidden />
                {label}
                <span className="num text-[13px] leading-none tracking-normal">{items.length}</span>
              </h2>
              <ul className="m-0 list-none divide-y divide-border p-0 pb-1.5">
                {items.map((item) => row(item, tab === "rebuy"))}
              </ul>
            </div>
          ))}
      </Card>
    );
  }

  const showDetail = (isProcedures ? Boolean(selectedProcedure) : Boolean(selected)) && !empty;
  const currentName = isProcedures ? selectedProcedure?.title : selected?.name;

  return (
    <>
      <Topbar
        start={
          view === "item" && currentName ? (
            <>
              <span className="lg:hidden">
                <Crumb back={{ label: "Atelier", onClick: back }} current={currentName} />
              </span>
              <span className="hidden text-[15px] font-semibold lg:inline">
                {user.workspaceName}
              </span>
            </>
          ) : undefined
        }
      />
      <PageBody>
        <div
          className={cn(
            "grid gap-[26px]",
            showDetail && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:items-start lg:gap-x-7",
          )}
        >
          <div
            ref={listRef}
            className={cn("min-w-0", view === "item" && showDetail && "max-lg:hidden")}
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div>
                <p className="eyebrow">Inventaire du garage</p>
                <h1 className="mt-1 text-[28px] leading-[1.15] font-[650] tracking-[-0.02em]">
                  Atelier
                </h1>
              </div>
              {empty ? null : isProcedures ? (
                <Button onClick={() => actions.onNewProcedure?.()}>
                  <Plus />
                  Nouvelle fiche
                </Button>
              ) : (
                <Button onClick={() => actions.onAddItem?.()}>
                  <Plus />
                  Ajouter un objet
                </Button>
              )}
            </div>

            {!empty && summary.length ? (
              <button
                type="button"
                onClick={() => setTab("rebuy")}
                className="mb-4 flex min-h-12 w-full items-center gap-2.5 rounded-card border border-border bg-surface py-[7px] pr-3 pl-2 text-left shadow-(--shadow-sm) transition-[border-color] hover:border-[color-mix(in_oklch,var(--border),var(--fg)_25%)]"
              >
                <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand-ink">
                  <ShoppingCart className="size-[17px] stroke-[2.3]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm text-fg-muted">
                  {summary.map(([n, label], index) => (
                    <React.Fragment key={label}>
                      {index ? " · " : ""}
                      <b className="num text-lg leading-none font-bold text-fg">{n}</b> {label}
                    </React.Fragment>
                  ))}
                  <span className="sr-only">, voir « À racheter »</span>
                </span>
                <ChevronRight className="size-[18px] text-fg-muted" aria-hidden />
              </button>
            ) : null}

            {empty ? null : (
              <div className="mb-4 grid gap-3">
                <fieldset className="m-0 min-w-0 border-0 p-0">
                  <legend className="sr-only">Afficher</legend>
                  <ChipRow scroll className="-mx-4 px-4 md:mx-0 md:flex-wrap md:px-0">
                    {(
                      [
                        ["parts", "Pièces"],
                        ["products", "Produits"],
                        ["tools", "Outils"],
                      ] as const
                    ).map(([value, label]) => (
                      <Chip
                        key={value}
                        name="workshop-tab"
                        value={value}
                        checked={tab === value}
                        onChange={() => setTab(value)}
                      >
                        {label} <ChipCount>{visible(value).length}</ChipCount>
                      </Chip>
                    ))}
                    <Chip
                      name="workshop-tab"
                      value="rebuy"
                      checked={tab === "rebuy"}
                      onChange={() => setTab("rebuy")}
                    >
                      <ShoppingCart aria-hidden />À racheter{" "}
                      <ChipCount>{visible("rebuy").length}</ChipCount>
                    </Chip>
                    <Chip
                      name="workshop-tab"
                      value="procedures"
                      checked={isProcedures}
                      onChange={() => setTab("procedures")}
                    >
                      <ListOrdered aria-hidden />
                      Fiches{" "}
                      <ChipCount>
                        {procedures.filter((p) => !p.archived && procedurePasses(p)).length}
                      </ChipCount>
                    </Chip>
                  </ChipRow>
                </fieldset>
                <div className="flex flex-wrap gap-2 [&>*:first-child]:min-w-[min(100%,12rem)] [&>*:first-child]:flex-1">
                  <Input
                    type="search"
                    aria-label={isProcedures ? "Rechercher une fiche" : "Rechercher dans l'atelier"}
                    placeholder={
                      isProcedures ? "Titre, étape, matériel…" : "Nom, marque, référence…"
                    }
                    autoComplete="off"
                    icon={<Search />}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setView("list");
                    }}
                  />
                  <NativeSelect
                    aria-label="Filtrer par vélo"
                    value={bikeId ?? ""}
                    onChange={(e) => {
                      setBikeId(e.target.value ? Number(e.target.value) : null);
                      setView("list");
                    }}
                  >
                    <option value="">Tous les vélos</option>
                    {vm.bikes.map((bike) => (
                      <option key={bike.id} value={bike.id}>
                        {bike.name}
                      </option>
                    ))}
                  </NativeSelect>
                  {isProcedures && procedureTypes.length ? (
                    <NativeSelect
                      aria-label="Filtrer par type de pièce"
                      value={typeFilter}
                      onChange={(e) => {
                        setTypeFilter(e.target.value);
                        setView("list");
                      }}
                    >
                      <option value="">Tous les types</option>
                      {procedureTypes.map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : null}
                </div>
              </div>
            )}
            <p className="sr-only" role="status">
              {isProcedures
                ? `${procedureList.length} fiche${procedureList.length > 1 ? "s" : ""}`
                : `${list.length} objet${list.length > 1 ? "s" : ""}`}
            </p>
            {body}
          </div>

          {showDetail && isProcedures && selectedProcedure ? (
            <div
              className={cn(
                "min-w-0 lg:sticky lg:top-[68px] lg:-m-1 lg:max-h-[calc(100dvh-80px)] lg:overflow-y-auto lg:overscroll-contain lg:p-1",
                view === "list" && "max-lg:hidden",
              )}
            >
              <ProcedureDetail
                key={`${selectedProcedure.id}-${bikeId ?? ""}`}
                procedure={selectedProcedure}
                items={vm.items}
                bikes={vm.bikes}
                initialBikeId={bikeId}
                actions={{ ...actions.procedure, onOpenItem: openItemFromProcedure }}
              />
            </div>
          ) : null}
          {showDetail && !isProcedures && selected ? (
            <div
              className={cn(
                "min-w-0 lg:sticky lg:top-[68px] lg:-m-1 lg:max-h-[calc(100dvh-80px)] lg:overflow-y-auto lg:overscroll-contain lg:p-1",
                view === "list" && "max-lg:hidden",
              )}
            >
              <ItemDetail
                key={selected.id}
                item={selected}
                today={vm.today}
                allBikes={vm.bikes}
                actions={actions}
                bikeHref={bikeHref}
                focusReceive={focusReceive}
              />
            </div>
          ) : null}
        </div>
      </PageBody>
    </>
  );
}
