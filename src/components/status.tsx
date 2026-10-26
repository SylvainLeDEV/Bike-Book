import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { REBUY_STATE_ICONS, RULE_STATUS_ICONS } from "@/components/icons";
import { formatPercent } from "@/lib/format";
import { REBUY_STATE_LABELS, RULE_STATUS_LABELS } from "@/lib/labels";
import type { RebuyState, RuleStatus } from "@/lib/view-models";

const STATUS_VARIANT = {
  ok: "ok",
  due_soon: "soon",
  overdue: "late",
  snoozed: "neutral",
} as const satisfies Record<RuleStatus, string>;

/** Wear status: colour, icon and word, never colour alone. */
export function RuleStatusBadge({
  status,
  label,
  className,
}: {
  status: RuleStatus;
  /** Replaces the status word, e.g. "1 en retard". */
  label?: string;
  className?: string;
}) {
  const Icon = RULE_STATUS_ICONS[status];
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      <Icon aria-hidden />
      {label ?? RULE_STATUS_LABELS[status]}
    </Badge>
  );
}

/** A tiny round status mark next to a component name, with its label for screen readers. */
export function RuleStatusMark({ status }: { status: RuleStatus }) {
  const Icon = RULE_STATUS_ICONS[status];
  const tone = {
    ok: "bg-ok-soft text-ok-ink",
    due_soon: "bg-soon-soft text-soon-ink",
    overdue: "bg-late-soft text-late-ink",
    snoozed: "bg-surface-2 text-fg-muted",
  }[status];
  return (
    <span
      role="img"
      aria-label={RULE_STATUS_LABELS[status]}
      className={cn("inline-grid size-[18px] place-items-center rounded-full", tone)}
    >
      <Icon className="size-3 stroke-[2.8]" aria-hidden />
    </span>
  );
}

const REBUY_VARIANT = {
  to_order: "outline",
  ordered: "brand",
  low_stock: "stock",
} as const satisfies Record<RebuyState, string>;

/** Restocking state: accent and neutrals only, the wear colours stay reserved (D-30). */
export function RebuyBadge({ state }: { state: RebuyState }) {
  const Icon = REBUY_STATE_ICONS[state];
  return (
    <Badge variant={REBUY_VARIANT[state]}>
      <Icon aria-hidden />
      {REBUY_STATE_LABELS[state]}
    </Badge>
  );
}

/**
 * Wear bar: fill up to 100 %, a tick at the "due soon" threshold, hatched beyond 100 %. The
 * label says the figures, so the bar is never the only carrier of the information.
 */
export function WearBar({
  ratio,
  warnRatio,
  status,
  label,
  className,
}: {
  ratio: number;
  warnRatio: number;
  status: RuleStatus;
  /** Read by screen readers: "56 h 20 sur 50 h". The percentage is added. */
  label: string;
  className?: string;
}) {
  const fill = {
    ok: "bg-ok",
    due_soon: "bg-soon",
    overdue: "bg-late wear-hatch",
    snoozed: "bg-fg-muted",
  }[status];
  return (
    <div
      role="img"
      aria-label={`${label}, ${formatPercent(ratio)}`}
      className={cn("relative h-2 rounded-full bg-track", className)}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 rounded-[inherit] transition-[width] duration-500",
          fill,
        )}
        style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` }}
      />
      <span
        className="absolute -top-[3px] -bottom-[3px] w-0.5 rounded-[1px] bg-fg-muted opacity-60"
        style={{ left: `${warnRatio * 100}%` }}
      />
    </div>
  );
}
