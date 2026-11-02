import { cn } from "cn";
import { Check, MapPin } from "lucide-react";
import { BikePip } from "@/components/bike-cover";
import { CATEGORY_ICONS } from "@/components/icons";
import { RebuyBadge } from "@/components/status";
import { bikesText } from "@/lib/display";
import { formatInteger, plural } from "@/lib/format";
import { PRODUCT_LEVEL_LABELS, UNIT_LABELS } from "@/lib/labels";
import type { BikeRef, InventoryRowVM, ItemStockVM, ProductLevel } from "@/lib/view-models";

const LEVEL_BARS: Record<ProductLevel, number> = { full: 3, started: 2, low: 1, empty: 0 };

/**
 * A product's level as three bars (the mockup's gauge): decoration only, the word is always
 * written next to it.
 */
export function LevelGauge({ level, className }: { level: ProductLevel; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex h-[19px] items-center gap-[3px]", className)}>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn(
            "h-3.5 w-[9px] rounded-[3px]",
            bar <= LEVEL_BARS[level]
              ? "bg-brand"
              : "shadow-[inset_0_0_0_1.5px_color-mix(in_oklch,var(--fg-muted),transparent_45%)]",
          )}
        />
      ))}
    </span>
  );
}

/** The right-hand side of a row: units, the open container's level, or possession. */
function StockSide({ stock }: { stock: ItemStockVM }) {
  switch (stock.kind) {
    case "part": {
      const [one, many] = UNIT_LABELS[stock.unit];
      return (
        <>
          <span className="num text-[19px] leading-none font-semibold">
            {formatInteger(stock.quantity)}
          </span>
          <span className="text-[12.5px] whitespace-nowrap text-fg-muted">
            {plural(stock.quantity, one, many)}
          </span>
        </>
      );
    }
    case "product": {
      const level = stock.containers > 0 ? stock.level : "empty";
      const spare = stock.containers - 1;
      return (
        <>
          <LevelGauge level={level} />
          <span className="text-[12.5px] whitespace-nowrap text-fg-muted">
            {PRODUCT_LEVEL_LABELS[level]}
          </span>
          {spare > 0 ? (
            <span className="text-[12.5px] whitespace-nowrap text-fg-muted">
              +{formatInteger(spare)} en réserve
            </span>
          ) : null}
        </>
      );
    }
    case "tool":
      return stock.owned ? (
        <span className="inline-flex items-center gap-1 text-[12.5px] whitespace-nowrap text-fg-muted [&_svg]:size-3.5">
          <Check aria-hidden />
          Possédé
        </span>
      ) : (
        <span className="text-[12.5px] whitespace-nowrap text-fg-muted">Non possédé</span>
      );
  }
}

export function CategoryIcon({
  category,
  className,
}: {
  category: InventoryRowVM["category"];
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-muted [&_svg]:size-[18px]",
        className,
      )}
    >
      <Icon aria-hidden />
    </span>
  );
}

/** Bike pastilles and their names; every bike is read out when the text says "3 vélos". */
export function BikesMeta({ bikes, all }: { bikes: BikeRef[] | "all"; all: BikeRef[] }) {
  const list = bikes === "all" ? all : bikes;
  return (
    <>
      {list.length ? (
        <span className="inline-flex shrink-0" aria-hidden>
          {list.map((bike) => (
            <BikePip key={bike.id} cover={bike.cover} />
          ))}
        </span>
      ) : null}
      <span className="min-w-0 truncate">
        {bikesText(bikes)}
        {bikes !== "all" && bikes.length > 2 ? (
          <span className="sr-only"> : {bikes.map((bike) => bike.name).join(", ")}</span>
        ) : null}
      </span>
    </>
  );
}

/**
 * One dense workshop row: photo or category icon, name, bikes (or storage place), its stock
 * (quantity, level or possession) and at most one badge. Rendered inside a link or a button by
 * the caller.
 */
export function InventoryRowContent({
  row,
  allBikes,
  showLocation = false,
  showBadge = true,
  extra,
}: {
  row: InventoryRowVM;
  allBikes: BikeRef[];
  /** Storage place instead of bikes (bike page). */
  showLocation?: boolean;
  showBadge?: boolean;
  /** Extra line under the meta (cheapest purchase link in "À racheter"). */
  extra?: React.ReactNode;
}) {
  return (
    <>
      {row.photoUrl ? (
        // The item's photo (D-75), else its category icon.
        // eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler
        <img src={row.photoUrl} alt="" className="row-span-2 size-9 rounded-[10px] object-cover" />
      ) : (
        <CategoryIcon category={row.category} className="row-span-2" />
      )}
      <span className="col-start-2 min-w-0 text-[14.5px] leading-[1.35] font-semibold">
        {row.name}
      </span>
      <span className="col-start-3 row-span-2 row-start-1 grid justify-items-end gap-1 text-right">
        <StockSide stock={row} />
      </span>
      <span className="col-start-2 flex min-w-0 items-center gap-1.5 text-[13px] text-fg-muted [&_svg]:size-3.5 [&_svg]:shrink-0">
        {showLocation ? (
          <>
            <MapPin aria-hidden />
            <span className="min-w-0 truncate">{row.location ?? "Rangement non précisé"}</span>
          </>
        ) : (
          <BikesMeta bikes={row.bikes} all={allBikes} />
        )}
      </span>
      {extra ? <span className="col-start-2 text-[13px] text-fg-muted">{extra}</span> : null}
      {showBadge && row.state ? (
        <span className="col-span-2 col-start-2 mt-1.5 flex flex-wrap gap-1.5">
          <RebuyBadge state={row.state} />
        </span>
      ) : null}
    </>
  );
}

export const inventoryRowClasses =
  "grid min-h-16 w-full grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-4 py-3 text-left text-inherit transition-colors hover:bg-[color-mix(in_oklch,var(--surface-2),var(--surface)_40%)] focus-visible:-outline-offset-3";
