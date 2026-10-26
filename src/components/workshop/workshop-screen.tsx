"use client";

import * as React from "react";
import { cn } from "cn";
import {
  ChevronRight,
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
import { useShell } from "@/components/shell/shell-context";
import { Crumb, PageBody, Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, ChipCount, ChipRow } from "@/components/ui/chip";
import { Input, NativeSelect } from "@/components/ui/field";
import { formatMoney } from "@/lib/format";
import { INVENTORY_CATEGORY_LABELS } from "@/lib/labels";
import type { InventoryCategory, InventoryItemVM, RebuyState, WorkshopVM } from "@/lib/view-models";
import { InventoryRowContent, inventoryRowClasses } from "./inventory-row";
import { ItemDetail, type ItemActions } from "./item-detail";

export type WorkshopTab = "parts" | "rebuy";

export type WorkshopActions = ItemActions & {
  onAddItem?: (suggestion?: string) => void;
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

const SUGGESTIONS = ["Plaquettes de frein", "Chaîne", "Chambre à air"];

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
 * The workshop, parts only in phase 1 (D-33): a summary line that leads to "À racheter",
 * filters, search and a bike filter, rows grouped by category (by state in "À racheter").
 * Under 1024 px an item replaces the list; from 1024 px they sit side by side.
 */
export function WorkshopScreen({
  vm,
  actions,
  bikeHref,
  initial,
}: {
  vm: WorkshopVM;
  actions: WorkshopActions;
  bikeHref: (bikeId: number) => string;
  initial?: {
    tab?: WorkshopTab;
    bikeId?: number | null;
    itemId?: number | null;
    receive?: boolean;
  };
}) {
  const { user } = useShell();
  const [tab, setTab] = React.useState<WorkshopTab>(initial?.tab ?? "parts");
  const [query, setQuery] = React.useState("");
  const [bikeId, setBikeId] = React.useState<number | null>(initial?.bikeId ?? null);
  const [selectedId, setSelectedId] = React.useState<number | null>(
    initial?.itemId ?? vm.items[0]?.id ?? null,
  );
  // Phone and tablet: the list, or one item in its place.
  const [view, setView] = React.useState<"list" | "item">(initial?.itemId ? "item" : "list");
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
    t === "rebuy" ? item.state !== null : true;
  const visible = (t: WorkshopTab) => vm.items.filter((item) => inTab(item, t) && passes(item));
  const list = visible(tab);
  const selected = vm.items.find((item) => item.id === selectedId) ?? null;

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

  function back() {
    setView("list");
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-item-id="${selectedId}"]`);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: "nearest" });
    });
  }

  function clearFilters() {
    setQuery("");
    setBikeId(null);
  }

  const empty = vm.items.length === 0;
  const filtered = Boolean(query.trim()) || bikeId != null;

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
          aria-current={item.id === selectedId ? "true" : undefined}
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
  if (empty) {
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
              {SUGGESTIONS.map((name) => (
                <Button
                  key={name}
                  variant="secondary"
                  size="sm"
                  onClick={() => actions.onAddItem?.(name)}
                >
                  {name}
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
    body =
      tab === "rebuy" && !filtered ? (
        <EmptyState compact title="Rien à racheter">
          Les objets sous leur seuil d&apos;alerte arriveront ici tout seuls.
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

  const showDetail = Boolean(selected) && !empty;

  return (
    <>
      <Topbar
        start={
          view === "item" && selected ? (
            <>
              <span className="lg:hidden">
                <Crumb back={{ label: "Atelier", onClick: back }} current={selected.name} />
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
              {empty ? null : (
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
                    <Chip
                      name="workshop-tab"
                      value="parts"
                      checked={tab === "parts"}
                      onChange={() => setTab("parts")}
                    >
                      Pièces <ChipCount>{visible("parts").length}</ChipCount>
                    </Chip>
                    <Chip
                      name="workshop-tab"
                      value="rebuy"
                      checked={tab === "rebuy"}
                      onChange={() => setTab("rebuy")}
                    >
                      <ShoppingCart aria-hidden />À racheter{" "}
                      <ChipCount>{visible("rebuy").length}</ChipCount>
                    </Chip>
                  </ChipRow>
                </fieldset>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <Input
                    type="search"
                    aria-label="Rechercher dans l'atelier"
                    placeholder="Nom, marque, référence…"
                    autoComplete="off"
                    icon={<Search />}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <NativeSelect
                    aria-label="Filtrer par vélo"
                    value={bikeId ?? ""}
                    onChange={(e) => setBikeId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Tous les vélos</option>
                    {vm.bikes.map((bike) => (
                      <option key={bike.id} value={bike.id}>
                        {bike.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            )}
            <p className="sr-only" role="status">
              {list.length} objet{list.length > 1 ? "s" : ""}
            </p>
            {body}
          </div>

          {showDetail && selected ? (
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
