import Link from "next/link";
import { Zap } from "lucide-react";
import { BikeCover } from "@/components/bike-cover";
import { RuleStatusBadge } from "@/components/status";
import { formatDate, formatDistance, formatDuration } from "@/lib/format";
import { BIKE_STATUS_LABELS, DISCIPLINE_LABELS } from "@/lib/labels";
import type { BikeCardVM } from "@/lib/view-models";
import { BIKE_STATUS_ICONS } from "./bike-record";

const pill =
  "inline-flex h-6 items-center gap-1 rounded-full bg-photo-glass px-[9px] text-xs leading-none font-semibold whitespace-nowrap backdrop-blur-md [&_svg]:size-[13px]";

/** A bike as a card: cover, name, discipline, this month's riding and its most urgent status. */
export function BikeCard({ card, href }: { card: BikeCardVM; href: string }) {
  const active = card.status === "active";
  const StatusIcon = BIKE_STATUS_ICONS[card.status];
  return (
    <Link
      href={href}
      className="block shrink-0 grow-0 basis-[80%] snap-start overflow-hidden rounded-card border border-border bg-surface text-inherit shadow-(--shadow-sm) transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-(--shadow-md) md:basis-auto"
    >
      <BikeCover cover={card.bike.cover} className="aspect-video lg:aspect-[2.7/1]">
        <span className="absolute inset-0 bg-[linear-gradient(to_top,var(--photo-shade),transparent_55%)]" />
        {active ? null : (
          <span className={`absolute top-3 left-3.5 text-on-photo ${pill}`}>
            <StatusIcon aria-hidden />
            {BIKE_STATUS_LABELS[card.status]}
          </span>
        )}
        <span className="absolute inset-x-3.5 bottom-[11px] flex items-end justify-between gap-2 text-on-photo">
          <span className="num text-2xl leading-none font-bold tracking-[0.01em]">
            {card.bike.name}
          </span>
          <span className={pill}>
            {card.isElectric ? <Zap aria-label="Assistance électrique" /> : null}
            {DISCIPLINE_LABELS[card.discipline]}
          </span>
        </span>
      </BikeCover>
      <span className="flex min-h-[46px] items-center justify-between gap-2 px-3.5 py-2.5 text-[13px] text-fg-muted">
        {active ? (
          <>
            <span>
              Ce mois ·{" "}
              <span className="num text-[15px] font-semibold text-fg">
                {formatDistance(card.monthDistanceM)} · {formatDuration(card.monthDurationS)}
              </span>
            </span>
            {card.alert ? (
              <RuleStatusBadge
                status={card.alert.status}
                label={`${card.alert.count} ${card.alert.status === "overdue" ? "en retard" : "bientôt"}`}
              />
            ) : (
              <RuleStatusBadge status="ok" />
            )}
          </>
        ) : (
          <span>
            {BIKE_STATUS_LABELS[card.status]}
            {card.statusChangedOn
              ? `${card.status === "sold" ? " le " : " depuis le "}${formatDate(card.statusChangedOn, { month: "short" })}`
              : null}
          </span>
        )}
      </span>
    </Link>
  );
}
