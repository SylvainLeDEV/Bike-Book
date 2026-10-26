import { cn } from "cn";
import { Info, Paperclip, Wrench } from "lucide-react";
import { RIDE_TYPE_ICONS } from "@/components/icons";
import { PhotoThumbs } from "@/components/photos/photo-thumbs";
import { maintenanceFigures, rideFigures } from "@/lib/display";
import {
  formatDate,
  formatDayLabel,
  formatDuration,
  formatMonthYear,
  type LocalDate,
} from "@/lib/format";
import { CONDITIONS_LABELS, RIDE_TYPE_LABELS } from "@/lib/labels";
import type { TimelineItemVM } from "@/lib/view-models";

function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-xs font-medium [&_svg]:size-[13px]",
        tone === "info" ? "bg-brand-soft text-brand-ink" : "bg-surface-2 text-fg-muted",
      )}
    >
      {children}
    </span>
  );
}

function TimelineEntry({
  item,
  today,
  withBike,
  relativeDates,
  addPhotos,
}: {
  item: TimelineItemVM;
  today: LocalDate;
  withBike: boolean;
  relativeDates: boolean;
  addPhotos?: (eventId: number, title: string, hasPhotos: boolean) => React.ReactNode;
}) {
  const isRide = item.kind === "ride";
  const Icon = isRide ? RIDE_TYPE_ICONS[item.rideType] : Wrench;
  const date = relativeDates
    ? formatDayLabel(item.on, today)
    : formatDate(item.on, {
        month: "short",
        year: "auto",
        weekday: "short",
        today,
        capitalized: true,
      });
  const kindLabel = isRide
    ? RIDE_TYPE_LABELS[item.rideType]
    : item.performedBy === "shop"
      ? `Atelier ${item.shopName ?? ""}`.trim()
      : withBike
        ? "Entretien"
        : "Entretien maison";
  const figures = isRide
    ? rideFigures(item)
    : maintenanceFigures(item.totalCostCents, item.performedBy);

  const tags: React.ReactNode[] = [];
  if (isRide && item.conditions) tags.push(<Tag key="c">{CONDITIONS_LABELS[item.conditions]}</Tag>);
  if (isRide && item.wearS != null)
    tags.push(
      <Tag key="w" tone="info">
        <Info aria-hidden />
        Usure comptée : {formatDuration(item.wearS)} de descente
      </Tag>,
    );
  if (!isRide) {
    for (const invoice of item.invoices)
      tags.push(
        <Tag key={`i${invoice.id}`}>
          <Paperclip aria-hidden />
          {invoice.name}
        </Tag>,
      );
    if (item.note) tags.push(<Tag key="n">{item.note}</Tag>);
  }

  const showPhotos = !withBike && (item.photos.length > 0 || (!isRide && addPhotos));

  return (
    <li
      data-kind={item.kind}
      id={`${item.kind}-${item.id}`}
      tabIndex={-1}
      className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 pb-[18px] outline-none before:absolute before:top-10 before:bottom-1 before:left-[17px] before:w-0.5 before:rounded-[1px] before:bg-border last:pb-0 last:before:hidden"
    >
      <span
        className={cn(
          "grid size-9 place-items-center rounded-full [&_svg]:size-[18px]",
          isRide ? "bg-surface-2 text-fg-muted" : "bg-brand-soft text-brand-ink",
        )}
      >
        <Icon aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-1.5 text-[13px] text-fg-muted">
          <b className="font-semibold text-fg">{date}</b>
          <span>
            · {withBike ? `${item.bikeName} · ` : ""}
            {kindLabel}
          </span>
        </p>
        <h4 className="mt-0.5 text-[15px] leading-[1.35] font-semibold">{item.title}</h4>
        {figures ? (
          <p className="mt-0.5 num text-base leading-[1.35] font-medium">{figures}</p>
        ) : null}
        {tags.length ? <div className="mt-2 flex flex-wrap gap-1.5">{tags}</div> : null}
        {showPhotos ? (
          <PhotoThumbs
            photos={item.photos}
            title={`${date} · ${item.title}`}
            extra={
              !isRide && addPhotos ? addPhotos(item.id, item.title, item.photos.length > 0) : null
            }
          />
        ) : null}
      </div>
    </li>
  );
}

/**
 * Rides and maintenance, newest first. `groupByMonth` adds month headings (bike history);
 * `withBike` names the bike on each entry (dashboard).
 */
export function Timeline({
  items,
  today,
  withBike = false,
  groupByMonth = false,
  relativeDates = false,
  addPhotos,
}: {
  items: TimelineItemVM[];
  today: LocalDate;
  withBike?: boolean;
  groupByMonth?: boolean;
  relativeDates?: boolean;
  /** Renders the "add photos" control of a maintenance event (bike page). */
  addPhotos?: (eventId: number, title: string, hasPhotos: boolean) => React.ReactNode;
}) {
  const entry = (item: TimelineItemVM) => (
    <TimelineEntry
      key={`${item.kind}-${item.id}`}
      item={item}
      today={today}
      withBike={withBike}
      relativeDates={relativeDates}
      addPhotos={addPhotos}
    />
  );
  if (!items.length) {
    return (
      <p className="text-[13px] text-fg-muted">
        Aucune sortie ni aucun entretien pour l&apos;instant.
      </p>
    );
  }
  if (!groupByMonth) return <ol className="m-0 list-none p-0">{items.map(entry)}</ol>;

  const months: { key: string; items: TimelineItemVM[] }[] = [];
  for (const item of items) {
    const key = item.on.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.items.push(item);
    else months.push({ key, items: [item] });
  }
  return (
    <div>
      {months.map((month, index) => (
        <section key={month.key}>
          <h3 className={cn("mb-2.5 eyebrow", index > 0 && "mt-[18px]")}>
            {formatMonthYear(`${month.key}-01`)}
          </h3>
          <ol className="m-0 list-none p-0">{month.items.map(entry)}</ol>
        </section>
      ))}
    </div>
  );
}
