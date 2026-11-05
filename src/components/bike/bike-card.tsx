import Link from "next/link";
import { SlidersHorizontal, Zap } from "lucide-react";
import { BikeCover } from "@/components/bike-cover";
import { RuleStatusBadge } from "@/components/status";
import { formatDate, formatDistance, formatDuration } from "@/lib/format";
import { BIKE_STATUS_LABELS, DISCIPLINE_LABELS } from "@/lib/labels";
import type { BikeCardVM } from "@/lib/view-models";
import { BIKE_STATUS_ICONS } from "./bike-record";

const pill =
  "inline-flex h-6 items-center gap-1 rounded-full bg-photo-glass px-[9px] text-xs leading-none font-semibold whitespace-nowrap backdrop-blur-md [&_svg]:size-[13px]";

/**
 * A bike as a card: cover, name, discipline, this month's riding and its most urgent status. A
 * "Réglages" shortcut opens the bike's setup tab (D-79); it sits beside the card's link, not in it.
 */
export function BikeCard({
  card,
  href,
  setupHref,
}: {
  card: BikeCardVM;
  href: string;
  setupHref?: string;
}) {
  const active = card.status === "active";
  const StatusIcon = BIKE_STATUS_ICONS[card.status];
  const monthFigures = (
    <span className="num text-[15px] font-semibold whitespace-nowrap text-fg">
      {formatDistance(card.monthDistanceM)} · {formatDuration(card.monthDurationS)}
    </span>
  );
  return (
    <div className="@container relative shrink-0 grow-0 basis-[80%] snap-start transition-transform has-[a:hover]:-translate-y-0.5 md:basis-auto">
      <Link
        href={href}
        className="block overflow-hidden rounded-card border border-border bg-surface text-inherit shadow-(--shadow-sm) transition-shadow hover:shadow-(--shadow-md)"
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
        <span className="flex min-h-[46px] flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3.5 py-2.5 text-[13px] text-fg-muted">
          {active ? (
            <>
              {/* The card's own width decides (the dashboard's carousel cards are narrow): the
                  figures take their own line below 24rem, so they never wrap mid-figure. */}
              <span>
                Ce mois
                <span className="hidden @min-[24rem]:inline"> · {monthFigures}</span>
              </span>
              {card.alert ? (
                <RuleStatusBadge
                  status={card.alert.status}
                  label={`${card.alert.count} ${card.alert.status === "overdue" ? "en retard" : "bientôt"}`}
                />
              ) : (
                <RuleStatusBadge status="ok" />
              )}
              <span className="basis-full @min-[24rem]:hidden">{monthFigures}</span>
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
      {setupHref ? (
        <Link
          href={setupHref}
          aria-label={`Réglages de ${card.bike.name}`}
          className={`absolute top-3 right-3.5 text-on-photo no-underline hover:bg-[color-mix(in_oklch,var(--photo-glass),black_20%)] pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 ${pill}`}
        >
          <SlidersHorizontal aria-hidden />
          Réglages
        </Link>
      ) : null}
    </div>
  );
}
