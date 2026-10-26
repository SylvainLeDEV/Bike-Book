import Link from "next/link";
import { cn } from "cn";
import { Clock, OctagonAlert, Package, Plus, ShoppingCart } from "lucide-react";
import { BikeLine } from "@/components/bike-cover";
import { BikeCard } from "@/components/bike/bike-card";
import { EmptyState } from "@/components/empty-state";
import { PlanList, type PlanActions } from "@/components/plan/plan-list";
import { RebuyBadge } from "@/components/status";
import { Timeline } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bikesText, formatStock } from "@/lib/display";
import { formatDate, formatMoney, type LocalDate } from "@/lib/format";
import type { DashboardVM, RebuyRowVM } from "@/lib/view-models";

export type DashboardLinks = {
  bike: (bikeId: number) => string;
  /** The workshop's "À racheter" filter. */
  rebuy: string;
  workshopItem: (itemId: number) => string;
  activity: string;
  bikes: string;
};

function SectionHead({
  title,
  id,
  action,
}: {
  title: string;
  id?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[17px] leading-[1.3] font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {action}
    </div>
  );
}

function SummaryPill({
  href,
  tone,
  icon: Icon,
  count,
  label,
}: {
  href: string;
  tone: "late" | "soon" | "brand";
  icon: typeof Clock;
  count: number;
  label: string;
}) {
  const iconTone = {
    late: "bg-late-soft text-late-ink",
    soon: "bg-soon-soft text-soon-ink",
    brand: "bg-brand-soft text-brand-ink",
  }[tone];
  return (
    <Link
      href={href}
      className="flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-border bg-surface pr-4 pl-2 shadow-(--shadow-sm) transition-[border-color,transform] hover:border-[color-mix(in_oklch,var(--border),var(--fg)_25%)] active:translate-y-px"
    >
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full [&_svg]:size-[17px] [&_svg]:stroke-[2.3]",
          iconTone,
        )}
      >
        <Icon aria-hidden />
      </span>
      <strong className="num text-2xl leading-none font-bold">{count}</strong>
      <span className="text-[13.5px] text-fg-muted">{label}</span>
    </Link>
  );
}

function rebuyMeta(row: RebuyRowVM, today: LocalDate): string {
  const reason = row.reason;
  switch (reason.kind) {
    case "rule":
      if (reason.status === "overdue") return "pour un entretien en retard";
      return reason.neededOn
        ? `nécessaire le ${formatDate(reason.neededOn, { year: "auto", today })}`
        : "pour un entretien bientôt dû";
    case "ordered":
      return [
        reason.priceCents != null ? formatMoney(reason.priceCents) : null,
        `commande du ${formatDate(reason.orderedOn, { month: "short", year: "auto", today })}`,
      ]
        .filter(Boolean)
        .join(" · ");
    case "low_stock":
      return `reste ${formatStock(reason.quantity, reason.unit)}`;
    case "price":
      return reason.priceCents != null ? formatMoney(reason.priceCents) : "aucun lien d'achat";
  }
}

/** "À racheter": the five most urgent rows (D-41), then "Tout voir". */
export function RebuyList({
  rows,
  today,
  itemHref,
}: {
  rows: RebuyRowVM[];
  today: LocalDate;
  itemHref: (itemId: number) => string;
}) {
  return (
    <Card asChild className="overflow-hidden">
      <ul className="m-0 list-none divide-y divide-border p-0">
        {rows.length ? (
          rows.slice(0, 5).map((row) => (
            <li key={row.itemId}>
              <Link
                href={itemHref(row.itemId)}
                className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-[color-mix(in_oklch,var(--surface-2),var(--surface)_40%)] focus-visible:-outline-offset-3"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-muted [&_svg]:size-[18px]">
                  <Package aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold">{row.name}</span>
                  <span className="block text-[13px] text-fg-muted">
                    {bikesText(row.bikes)} · {rebuyMeta(row, today)}
                  </span>
                </span>
                <RebuyBadge state={row.state} />
              </Link>
            </li>
          ))
        ) : (
          <li className="px-4 py-3 text-[13px] text-fg-muted">
            Rien à racheter pour l&apos;instant.
          </li>
        )}
      </ul>
    </Card>
  );
}

export function DashboardScreen({
  vm,
  actions,
  links,
  onAddBike,
}: {
  vm: DashboardVM;
  actions: PlanActions;
  links: DashboardLinks;
  /** "Ajouter un vélo", offered when there is no bike yet. */
  onAddBike?: () => void;
}) {
  const { counts } = vm;
  return (
    <>
      <div className="mb-4">
        <p className="eyebrow">
          {formatDate(vm.today, { weekday: "long", year: "never", capitalized: true })}
        </p>
        <h1 className="mt-1 text-[28px] leading-[1.15] font-[650] tracking-[-0.02em] text-balance">
          Bonjour {vm.firstName}
        </h1>
      </div>

      <div className="-mx-4 mb-[22px] no-scrollbar flex gap-2 overflow-x-auto px-4 py-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {counts.overdue ? (
          <SummaryPill
            href="#a-prevoir"
            tone="late"
            icon={OctagonAlert}
            count={counts.overdue}
            label="en retard"
          />
        ) : null}
        {counts.dueSoon ? (
          <SummaryPill
            href="#a-prevoir"
            tone="soon"
            icon={Clock}
            count={counts.dueSoon}
            label="bientôt"
          />
        ) : null}
        {counts.toRebuy ? (
          <SummaryPill
            href={links.rebuy}
            tone="brand"
            icon={ShoppingCart}
            count={counts.toRebuy}
            label="à racheter"
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-[26px] [grid-template-areas:'plan''bikes''parts''activity'] lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start lg:gap-x-7 lg:[grid-template-areas:'plan_bikes''activity_parts']">
        <section aria-labelledby="a-prevoir" className="[grid-area:plan]">
          <SectionHead title="À prévoir" id="a-prevoir" />
          <PlanList rules={vm.rules} tasks={vm.tasks} today={vm.today} withBike actions={actions} />
        </section>

        <section aria-labelledby="mes-velos" className="[grid-area:bikes]">
          <SectionHead
            title="Mes vélos"
            id="mes-velos"
            action={
              <Button variant="link" asChild>
                <Link href={links.bikes}>Gérer</Link>
              </Button>
            }
          />
          {vm.bikes.length ? (
            <div className="-mx-4 no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-0.5 pb-1.5 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:p-0 lg:grid-cols-1">
              {vm.bikes.map((card) => (
                <BikeCard key={card.bike.id} card={card} href={links.bike(card.bike.id)} />
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              art={<BikeLine />}
              title="Aucun vélo pour l'instant"
              action={
                onAddBike ? (
                  <Button onClick={onAddBike}>
                    <Plus />
                    Ajouter un vélo
                  </Button>
                ) : null
              }
            >
              Ajoute ton premier vélo : ses sorties, son entretien et ses pièces suivront.
            </EmptyState>
          )}
        </section>

        <section aria-labelledby="a-racheter" className="[grid-area:parts]">
          <SectionHead
            title="À racheter"
            id="a-racheter"
            action={
              vm.rebuy.length ? (
                <Button variant="link" asChild>
                  <Link href={links.rebuy}>Tout voir ({vm.rebuy.length})</Link>
                </Button>
              ) : null
            }
          />
          <RebuyList rows={vm.rebuy} today={vm.today} itemHref={links.workshopItem} />
        </section>

        <section aria-labelledby="dernieres-activites" className="[grid-area:activity]">
          <SectionHead
            title="Dernières activités"
            id="dernieres-activites"
            action={
              <Button variant="link" asChild>
                <Link href={links.activity}>Tout l&apos;historique</Link>
              </Button>
            }
          />
          <Card padded>
            <Timeline items={vm.activity} today={vm.today} withBike relativeDates />
          </Card>
        </section>
      </div>
    </>
  );
}
