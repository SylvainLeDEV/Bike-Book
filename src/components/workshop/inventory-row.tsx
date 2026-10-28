import { cn } from "cn";
import { MapPin } from "lucide-react";
import { BikePip } from "@/components/bike-cover";
import { CATEGORY_ICONS } from "@/components/icons";
import { RebuyBadge } from "@/components/status";
import { bikesText } from "@/lib/display";
import { formatInteger, plural } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/labels";
import type { BikeRef, InventoryRowVM } from "@/lib/view-models";

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
 * One dense workshop row: photo or category icon, name, bikes (or storage place), quantity and at most
 * one badge. Rendered inside a link or a button by the caller (`as`).
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
  const [one, many] = UNIT_LABELS[row.unit];
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
        <span className="num text-[19px] leading-none font-semibold">
          {formatInteger(row.quantity)}
        </span>
        <span className="text-[12.5px] whitespace-nowrap text-fg-muted">
          {plural(row.quantity, one, many)}
        </span>
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
