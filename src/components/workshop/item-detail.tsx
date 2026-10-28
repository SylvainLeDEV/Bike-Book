"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "cn";
import {
  Archive,
  Camera,
  Check,
  ClipboardList,
  ExternalLink,
  Globe,
  MapPin,
  Minus,
  PackageCheck,
  Pencil,
  Plus,
  Replace,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Truck,
} from "lucide-react";
import { AttachmentsBlock } from "@/components/attachments/attachments-block";
import { UploadRows } from "@/components/attachments/upload-controls";
import { useUploads } from "@/components/attachments/use-uploads";
import { BikeCover, BikePip } from "@/components/bike-cover";
import { RebuyBadge, RuleStatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatQuantity, formatStock } from "@/lib/display";
import {
  formatDate,
  formatInteger,
  formatMoney,
  formatSignedInteger,
  plural,
  type LocalDate,
} from "@/lib/format";
import { INVENTORY_CATEGORY_LABELS, MOVEMENT_LABELS, UNIT_LABELS } from "@/lib/labels";
import type { BikeRef, InventoryItemVM, PurchaseLinkVM } from "@/lib/view-models";

export type RestockStep = "to_order" | "ordered" | "received" | "none";

export type ItemActions = {
  /** −1: a use noted from the item page; +1: a purchase. Stock is never typed (D-39). */
  onMove?: (item: InventoryItemVM, delta: 1 | -1) => void | Promise<void>;
  /** Restocking: to order → ordered → received (quantity confirmed, D-42), or cancelled. */
  onRestock?: (item: InventoryItemVM, to: RestockStep, quantity: number) => void | Promise<void>;
  /** "Monter sur …": the replace sheet, this item chosen. */
  onMount?: (item: InventoryItemVM, bike: BikeRef) => void;
  onEdit?: (item: InventoryItemVM) => void;
  onEditThreshold?: (item: InventoryItemVM) => void;
  onCorrectStock?: (item: InventoryItemVM) => void;
  onEditBikes?: (item: InventoryItemVM) => void;
  onAddLink?: (item: InventoryItemVM) => void;
  onArchive?: (item: InventoryItemVM) => void;
};

function Section({
  id,
  title,
  side,
  children,
}: {
  id: string;
  title: string;
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 id={id} className="text-[17px] leading-[1.3] font-semibold tracking-[-0.01em]">
          {title}
        </h3>
        {side}
      </div>
      {children}
    </section>
  );
}

function Stepper({
  label,
  value,
  unitText,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
  minusDisabled,
}: {
  label?: string;
  value: number;
  unitText: string;
  onMinus?: () => void;
  onPlus?: () => void;
  minusLabel: string;
  plusLabel: string;
  minusDisabled?: boolean;
}) {
  const id = React.useId();
  const button =
    "grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-fg shadow-(--shadow-sm) transition-[background-color,transform] hover:bg-surface-2 active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none [&_svg]:size-[18px]";
  return (
    <div
      role="group"
      aria-labelledby={label ? id : undefined}
      className="my-2.5 flex items-center gap-3"
    >
      {label ? (
        <span id={id} className="sr-only">
          {label}
        </span>
      ) : null}
      <button
        type="button"
        className={button}
        onClick={onMinus}
        disabled={minusDisabled || !onMinus}
        aria-label={minusLabel}
      >
        <Minus aria-hidden />
      </button>
      <p className="min-w-[92px] text-center text-sm text-fg-muted" aria-live="polite">
        <span className="block num text-[34px] leading-none font-bold text-fg">
          {formatInteger(value)}
        </span>
        {unitText}
      </p>
      <button
        type="button"
        className={button}
        onClick={onPlus}
        disabled={!onPlus}
        aria-label={plusLabel}
      >
        <Plus aria-hidden />
      </button>
    </div>
  );
}

function RestockSteps({ item, today }: { item: InventoryItemVM; today: LocalDate }) {
  const ordered = item.restock.status === "ordered";
  const current = ordered ? 1 : 0;
  const steps: [string, LocalDate | null][] = [
    ["À commander", item.restock.changedOn],
    ["Commandé", ordered ? item.restock.orderedOn : null],
    ["Reçu", null],
  ];
  return (
    <ol className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
      {steps.map(([label, on], index) => {
        const state = index < current ? "done" : index === current ? "now" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "now" ? "step" : undefined}
            className={cn(
              "grid content-start gap-1 text-[12.5px] before:h-1 before:rounded-sm before:content-['']",
              state === "todo" ? "text-fg-muted before:bg-track" : "before:bg-brand",
              state === "now" ? "text-fg" : "text-fg-muted",
            )}
          >
            <b
              className={cn(
                "flex items-center gap-1",
                state === "now" ? "font-[650]" : "font-medium",
              )}
            >
              {state === "done" ? <Check className="size-3.5 stroke-[2.6]" aria-hidden /> : null}
              {label}
              <span className="sr-only">
                {state === "done"
                  ? " (fait)"
                  : state === "now"
                    ? " (étape en cours)"
                    : " (à venir)"}
              </span>
            </b>
            {on ? <span>{formatDate(on, { month: "short", year: "auto", today })}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function StockCard({
  item,
  today,
  actions,
  receiveRef,
}: {
  item: InventoryItemVM;
  today: LocalDate;
  actions: ItemActions;
  receiveRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [one, many] = UNIT_LABELS[item.unit];
  // Reset by the parent's `key` when the item or its restocking changes.
  const [quantity, setQuantity] = React.useState(item.restock.quantity ?? 1);
  const ordered = item.restock.status === "ordered";
  const restocking = item.restock.status !== "none";

  return (
    <Card asChild padded>
      <section aria-labelledby="stock-title">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <h3 id="stock-title" className="eyebrow">
            En stock
          </h3>
          {item.state ? <RebuyBadge state={item.state} /> : null}
        </div>
        <Stepper
          value={item.quantity}
          unitText={plural(item.quantity, one, many)}
          minusLabel={`Retirer 1 ${one} (utilisation)`}
          plusLabel={`Ajouter 1 ${one} (achat)`}
          minusDisabled={item.quantity === 0}
          onMinus={actions.onMove && (() => actions.onMove?.(item, -1))}
          onPlus={actions.onMove && (() => actions.onMove?.(item, 1))}
        />
        <p className="hint">
          {item.lowStockThreshold != null
            ? `Alerte à partir de ${formatStock(item.lowStockThreshold, item.unit)}. `
            : "Pas d'alerte de stock. "}
          « − » note une utilisation, « + » un achat : le stock n&apos;est jamais saisi directement.
        </p>
        <div className="mt-1.5 -ml-3 flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => actions.onEditThreshold?.(item)}>
            <SlidersHorizontal />
            Modifier le seuil
          </Button>
          <Button variant="ghost" size="sm" onClick={() => actions.onCorrectStock?.(item)}>
            <ClipboardList />
            Corriger le stock
          </Button>
        </div>

        {restocking ? (
          <div className="mt-3.5 grid gap-3 border-t border-border pt-3.5">
            <p className="text-sm">
              <b>Rachat</b>
              {ordered && item.restock.shopName ? ` · chez ${item.restock.shopName}` : ""}
            </p>
            <RestockSteps item={item} today={today} />
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <span className="text-[13.5px] font-semibold">
                {ordered ? "Quantité reçue" : "Quantité à commander"}
              </span>
              <Stepper
                label={ordered ? "Quantité reçue" : "Quantité à commander"}
                value={quantity}
                unitText={plural(quantity, one, many)}
                minusLabel="1 de moins"
                plusLabel="1 de plus"
                minusDisabled={quantity <= 1}
                onMinus={() => setQuantity((q) => Math.max(1, q - 1))}
                onPlus={() => setQuantity((q) => q + 1)}
              />
            </div>
            {ordered ? (
              <p className="-mt-2 hint">
                Préremplie avec la commande : ajuste-la si la livraison est incomplète.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {ordered ? (
                <Button
                  ref={receiveRef}
                  size="sm"
                  onClick={() => actions.onRestock?.(item, "received", quantity)}
                >
                  <PackageCheck />
                  Marquer reçu · +{formatStock(quantity, item.unit)}
                </Button>
              ) : (
                <Button size="sm" onClick={() => actions.onRestock?.(item, "ordered", quantity)}>
                  <Truck />
                  Marquer commandé
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => actions.onRestock?.(item, "none", quantity)}
              >
                Annuler le rachat
              </Button>
            </div>
          </div>
        ) : item.state === "low_stock" ? (
          <div className="mt-3.5 grid gap-3 border-t border-border pt-3.5">
            <p className="text-sm">
              Stock bas. Ajoute-le à « À racheter » pour ne pas l&apos;oublier.
            </p>
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => actions.onRestock?.(item, "to_order", 1)}
              >
                <ShoppingCart />À commander
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </Card>
  );
}

function linkMeta(link: PurchaseLinkVM, today: LocalDate) {
  const where = link.url ? new URL(link.url).host : "En magasin";
  const when = link.lastPurchasedOn
    ? `acheté le ${formatDate(link.lastPurchasedOn, { month: "short", year: "auto", today })}`
    : link.priceNotedOn
      ? `prix noté le ${formatDate(link.priceNotedOn, { month: "short", year: "auto", today })}`
      : null;
  return [where, when].filter(Boolean).join(" · ");
}

/** The item page ("fiche"): stock, restocking, bikes, purchase links, maintenance, history. */
export function ItemDetail({
  item,
  today,
  allBikes,
  actions,
  bikeHref,
  focusReceive = false,
}: {
  item: InventoryItemVM;
  today: LocalDate;
  allBikes: BikeRef[];
  actions: ItemActions;
  bikeHref: (bikeId: number) => string;
  /** Opened from "Reçu…": focus the reception button, the quantity just above it. */
  focusReceive?: boolean;
}) {
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const receiveRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (focusReceive) receiveRef.current?.focus({ preventScroll: true });
  }, [focusReceive, item.id]);

  const priced = item.purchaseLinks.filter((l) => l.priceCents != null);
  const cheapest =
    priced.length > 1
      ? priced.reduce((a, b) => ((b.priceCents ?? 0) < (a.priceCents ?? 0) ? b : a))
      : null;
  const servedBikes = item.bikes === "all" ? allBikes : item.bikes;
  const photoOwner = React.useMemo(
    () => ({ kind: "inventory_item" as const, id: item.id }),
    [item.id],
  );
  const photoUploads = useUploads(photoOwner);
  const mountOn = item.componentTypeCode && servedBikes.length === 1 ? servedBikes[0] : null;

  return (
    <article aria-labelledby="item-title" className="grid content-start gap-[22px]">
      <header className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3.5">
        <ItemPhoto
          item={item}
          enabled={photoUploads.enabled}
          onFiles={(files) => photoUploads.add(files.slice(0, 1), true)}
        />
        <div className="min-w-0">
          <p className="eyebrow">Pièce · {INVENTORY_CATEGORY_LABELS[item.category]}</p>
          <h2
            ref={titleRef}
            id="item-title"
            tabIndex={-1}
            className="mt-0.5 text-[22px] leading-tight font-[650] tracking-[-0.015em] text-balance outline-none"
          >
            {item.name}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {[item.brand, item.reference ? `réf. ${item.reference}` : "sans référence"]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-medium">
            <MapPin className="size-4 text-fg-muted" aria-hidden />
            {item.location ?? "Rangement non précisé"}
          </p>
        </div>
      </header>
      <UploadRows rows={photoUploads.rows} onDismiss={photoUploads.dismiss} />

      <div className="flex flex-wrap gap-2">
        {mountOn && actions.onMount ? (
          <Button variant="secondary" size="sm" onClick={() => actions.onMount?.(item, mountOn)}>
            <Replace />
            Monter sur{" "}
            {mountOn.name.startsWith("Le ") ? `le ${mountOn.name.slice(3)}` : `le ${mountOn.name}`}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => actions.onEdit?.(item)}>
          <Pencil />
          Modifier
        </Button>
      </div>

      <StockCard
        key={`${item.id}-${item.restock.status}-${item.restock.quantity}`}
        item={item}
        today={today}
        actions={actions}
        receiveRef={receiveRef}
      />

      <Section
        id="item-bikes"
        title="Vélos"
        side={
          <Button variant="link" onClick={() => actions.onEditBikes?.(item)}>
            Modifier
          </Button>
        }
      >
        {item.bikes === "all" ? (
          <>
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface pr-3.5 pl-1 text-sm font-medium">
              <span className="ml-2 inline-flex" aria-hidden>
                {allBikes.map((bike) => (
                  <BikePip key={bike.id} cover={bike.cover} />
                ))}
              </span>
              Tous les vélos
            </span>
            <p className="mt-2 hint">Y compris les vélos ajoutés plus tard.</p>
          </>
        ) : item.bikes.length ? (
          <div className="flex flex-wrap gap-2.5">
            {item.bikes.map((bike) => (
              <Link
                key={bike.id}
                href={bikeHref(bike.id)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface pr-3.5 pl-1 text-sm font-medium hover:border-fg-muted pointer-coarse:h-11"
              >
                <BikeCover as="span" cover={bike.cover} bare className="size-7 rounded-full" />
                {bike.name}
              </Link>
            ))}
          </div>
        ) : (
          <p className="hint">
            Aucun vélo lié : l&apos;objet n&apos;apparaît sur aucune page vélo.
          </p>
        )}
      </Section>

      <Section
        id="item-links"
        title="Liens d'achat"
        side={
          item.purchaseLinks.length ? (
            <Button variant="link" onClick={() => actions.onAddLink?.(item)}>
              Ajouter
            </Button>
          ) : null
        }
      >
        {item.purchaseLinks.length ? (
          <Card asChild className="overflow-hidden">
            <ul className="m-0 list-none divide-y divide-border p-0">
              {item.purchaseLinks.map((link) => (
                <li key={link.id} className="flex min-h-[60px] items-center gap-3 py-2.5 pr-2 pl-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-muted [&_svg]:size-[18px]">
                    {link.url ? <Globe aria-hidden /> : <Store aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold">{link.shopName}</p>
                    <p className="text-[13px] text-fg-muted">{linkMeta(link, today)}</p>
                  </div>
                  <span className="grid justify-items-end gap-0.5 num text-[17px] leading-none font-semibold whitespace-nowrap">
                    {link.priceCents != null ? formatMoney(link.priceCents) : "—"}
                    {link === cheapest ? (
                      <span className="font-sans text-xs leading-tight font-medium text-fg-muted">
                        le moins cher
                      </span>
                    ) : null}
                  </span>
                  {link.url ? (
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ouvrir la page chez ${link.shopName}, nouvel onglet`}
                      >
                        <ExternalLink />
                      </a>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card padded className="grid justify-items-start gap-1.5">
            <p className="text-[14.5px] font-semibold">Aucun lien d&apos;achat</p>
            <p className="hint">
              Note la boutique et le prix : tu sauras où racheter, et à quel prix.
            </p>
            <Button variant="secondary" size="sm" onClick={() => actions.onAddLink?.(item)}>
              <Plus />
              Ajouter un lien
            </Button>
          </Card>
        )}
        <p className="mt-2 hint">
          Prix notés à la main : l&apos;app ne contacte jamais les boutiques.
        </p>
      </Section>

      {item.rulesServed.length || item.lastUse ? (
        <Section id="item-rules" title="Entretiens concernés">
          {item.rulesServed.length ? (
            <Card asChild className="overflow-hidden">
              <ul className="m-0 list-none divide-y divide-border p-0">
                {item.rulesServed.map((rule) => (
                  <li
                    key={rule.ruleId}
                    className="flex min-h-[60px] items-center gap-3 px-4 py-2.5"
                  >
                    <BikeCover
                      cover={rule.bike.cover}
                      bare
                      className="size-9 shrink-0 rounded-[10px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold">{rule.title}</p>
                      <p className="text-[13px] text-fg-muted">
                        {rule.bike.name} ·{" "}
                        {rule.dueOn
                          ? `le ${formatDate(rule.dueOn, { year: "auto", today })}`
                          : `${formatQuantity(rule.used)} / ${formatQuantity(rule.interval)}`}
                      </p>
                    </div>
                    <RuleStatusBadge status={rule.status} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {item.lastUse ? (
            <p className="mt-2 hint">
              Dernière utilisation :{" "}
              {formatDate(item.lastUse.on, { month: "short", year: "auto", today })},{" "}
              {item.lastUse.bikeName} · {item.lastUse.title}.
            </p>
          ) : null}
        </Section>
      ) : null}

      <Section id="item-moves" title="Historique des mouvements">
        {item.movements.length ? (
          <Card asChild className="overflow-hidden">
            <ol className="m-0 list-none divide-y divide-border p-0">
              {item.movements.slice(0, 5).map((move) => (
                <li key={move.id} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
                  <span
                    className={cn(
                      "grid w-10 shrink-0 place-items-center num text-lg leading-none font-semibold",
                      move.quantityDelta > 0 && "text-brand-ink",
                    )}
                  >
                    <span aria-hidden>{formatSignedInteger(move.quantityDelta)}</span>
                    <span className="sr-only">
                      {move.quantityDelta > 0 ? "plus" : "moins"} {Math.abs(move.quantityDelta)}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{MOVEMENT_LABELS[move.kind]}</p>
                    {move.source || move.detail ? (
                      <p className="text-[13px] text-fg-muted">
                        {[move.source, move.maintenance ? null : move.detail]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {move.maintenance ? (
                      <Button variant="link" asChild className="text-[13px]">
                        <Link href={bikeHref(move.maintenance.bikeId)}>
                          {move.maintenance.title}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  <span className="shrink-0 self-start pt-0.5 text-[12.5px] whitespace-nowrap text-fg-muted">
                    {formatDate(move.occurredOn, { month: "short", year: "auto", today })}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        ) : (
          <Card padded className="hint">
            Aucun mouvement pour l&apos;instant.
            {item.restock.status !== "none" ? " Le stock bougera à la réception." : ""}
          </Card>
        )}
      </Section>

      {/* Any kind of item (D-33): the block knows nothing of parts (feature 10). */}
      <Card padded>
        <AttachmentsBlock
          key={item.id}
          owner={{ kind: "inventory_item", id: item.id }}
          title="Photos et documents"
        />
      </Card>

      {item.notes ? (
        <Section id="item-notes" title="Notes">
          <Card padded className="text-sm leading-relaxed">
            {item.notes}
          </Card>
        </Section>
      ) : null}

      <div>
        <Button variant="ghost" size="sm" onClick={() => actions.onArchive?.(item)}>
          <Archive />
          Archiver l&apos;objet
        </Button>
      </div>
    </article>
  );
}

/**
 * The item's photo (D-75): tapping it picks a new one, which becomes the item's photo. Its
 * other photos and documents are in "Photos et documents" below.
 */
function ItemPhoto({
  item,
  enabled,
  onFiles,
}: {
  item: InventoryItemVM;
  enabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={!enabled}
        onClick={() => input.current?.click()}
        aria-label={
          item.photoUrl ? "Changer la photo de l'article" : "Ajouter une photo de l'article"
        }
        className={cn(
          "relative grid size-16 place-items-center overflow-hidden rounded-card bg-surface text-fg-muted transition-colors hover:text-fg",
          item.photoUrl
            ? "border border-border"
            : "border-[1.5px] border-dashed border-[color-mix(in_oklch,var(--fg-muted),transparent_45%)] hover:border-fg-muted",
        )}
      >
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler
          <img src={item.photoUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <Camera className="size-[22px]" aria-hidden />
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
