import { cn } from "cn";
import { Check, ChevronRight, Info, Paperclip, Wrench } from "lucide-react";
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
  onEdit,
}: {
  item: TimelineItemVM;
  today: LocalDate;
  withBike: boolean;
  relativeDates: boolean;
  addPhotos?: (item: TimelineItemVM) => React.ReactNode;
  onEdit?: (item: TimelineItemVM) => void;
}) {
  const isRide = item.kind === "ride";
  const Icon = isRide ? RIDE_TYPE_ICONS[item.rideType] : item.kind === "task" ? Check : Wrench;
  const date = relativeDates
    ? formatDayLabel(item.on, today)
    : formatDate(item.on, {
        month: "short",
        year: "auto",
        weekday: "short",
        today,
        capitalized: true,
      });
  const kindLabel =
    item.kind === "ride"
      ? RIDE_TYPE_LABELS[item.rideType]
      : item.kind === "task"
        ? "Tâche faite"
        : item.performedBy === "shop"
          ? `Atelier ${item.shopName ?? ""}`.trim()
          : withBike
            ? "Entretien"
            : "Entretien maison";
  const figures =
    item.kind === "ride"
      ? rideFigures(item)
      : item.kind === "maintenance"
        ? maintenanceFigures(item.totalCostCents, item.performedBy)
        : null;
  const editLabel =
    item.kind === "ride"
      ? "Modifier la sortie"
      : item.kind === "task"
        ? "Modifier la tâche"
        : "Modifier l'entretien";

  const tags: React.ReactNode[] = [];
  if (isRide && item.conditions) tags.push(<Tag key="c">{CONDITIONS_LABELS[item.conditions]}</Tag>);
  if (isRide && item.wearS != null)
    tags.push(
      <Tag key="w" tone="info">
        <Info aria-hidden />
        Usure comptée : {formatDuration(item.wearS)} de descente
      </Tag>,
    );
  for (const document of item.documents)
    tags.push(
      <Tag key={`d${document.id}`}>
        <Paperclip aria-hidden />
        {document.caption ?? document.name}
      </Tag>,
    );
  if (item.kind !== "ride" && item.note) tags.push(<Tag key="n">{item.note}</Tag>);

  const showPhotos = !withBike && (item.photos.length > 0 || addPhotos);

  return (
    <li
      data-kind={item.kind}
      id={`${item.kind}-${item.id}`}
      tabIndex={-1}
      className={cn(
        "group relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 pb-[18px] outline-none before:absolute before:top-10 before:bottom-1 before:left-[17px] before:w-0.5 before:rounded-[1px] before:bg-border last:pb-0 last:before:hidden",
        onEdit && "grid-cols-[36px_minmax(0,1fr)_auto]",
      )}
    >
      <span
        className={cn(
          "grid size-9 place-items-center rounded-full [&_svg]:size-[18px]",
          isRide
            ? "bg-surface-2 text-fg-muted"
            : item.kind === "task"
              ? "bg-ok-soft text-ok-ink"
              : "bg-brand-soft text-brand-ink",
        )}
      >
        <Icon aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-1.5 text-[13px] text-fg-muted">
          <b className="font-semibold text-fg">{date}</b>
          <span>
            · {withBike ? `${item.bikeName ?? "Général"} · ` : ""}
            {kindLabel}
          </span>
        </p>
        <h4 className="mt-0.5 text-[15px] leading-[1.35] font-semibold">
          {onEdit ? (
            // The whole entry is the hit area (stretched over the <li>); the name keeps the title.
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="text-left outline-none group-hover:underline group-hover:underline-offset-3 after:absolute after:-inset-x-2 after:-top-1.5 after:bottom-2.5 after:rounded-lg group-last:after:-bottom-1.5 focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              <span className="sr-only">{editLabel} : </span>
              {item.title}
            </button>
          ) : (
            item.title
          )}
        </h4>
        {figures ? (
          <p className="mt-0.5 num text-base leading-[1.35] font-medium">{figures}</p>
        ) : null}
        {tags.length ? <div className="mt-2 flex flex-wrap gap-1.5">{tags}</div> : null}
        {showPhotos ? (
          <div className="relative z-10">
            <PhotoThumbs
              photos={item.photos}
              title={`${date} · ${item.title}`}
              extra={addPhotos ? addPhotos(item) : null}
            />
          </div>
        ) : null}
      </div>
      {onEdit ? (
        <ChevronRight
          className="size-[18px] self-center text-fg-muted group-hover:text-fg"
          aria-hidden
        />
      ) : null}
    </li>
  );
}

/**
 * Rides, maintenance and done tasks (D-77), newest first. `groupByMonth` adds month headings (bike history);
 * `withBike` names the bike on each entry (dashboard).
 */
export function Timeline({
  items,
  today,
  withBike = false,
  groupByMonth = false,
  relativeDates = false,
  addPhotos,
  onEdit,
}: {
  items: TimelineItemVM[];
  today: LocalDate;
  withBike?: boolean;
  groupByMonth?: boolean;
  relativeDates?: boolean;
  /** Renders the "add photos" control of a ride, a maintenance event or a task (bike page). */
  addPhotos?: (item: TimelineItemVM) => React.ReactNode;
  /** Makes each entry open its edit sheet (D-70). */
  onEdit?: (item: TimelineItemVM) => void;
}) {
  const entry = (item: TimelineItemVM) => (
    <TimelineEntry
      key={`${item.kind}-${item.id}`}
      item={item}
      today={today}
      withBike={withBike}
      relativeDates={relativeDates}
      addPhotos={addPhotos}
      onEdit={onEdit}
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
