import Link from "next/link";
import { cn } from "cn";
import {
  CalendarClock,
  Check,
  ListChecks,
  PackageCheck,
  PackageX,
  Pencil,
  Plus,
} from "lucide-react";
import { BikeCover } from "@/components/bike-cover";
import { CATEGORY_ICONS } from "@/components/icons";
import { RuleStatusBadge, WearBar } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatQuantity, formatStock, ruleNote } from "@/lib/display";
import { formatDate, type LocalDate } from "@/lib/format";
import { REBUY_STATE_LABELS } from "@/lib/labels";
import type { RuleRowVM, TaskRowVM } from "@/lib/view-models";
import { ActionButton } from "./action-button";

export type PlanActions = {
  onRuleDone?: (rule: RuleRowVM) => void | Promise<void>;
  onRuleSnooze?: (rule: RuleRowVM) => void | Promise<void>;
  onTaskDone?: (task: TaskRowVM) => void | Promise<void>;
  /** "Modifier la tâche": its fields and its attachments (feature 10). */
  onTaskEdit?: (task: TaskRowVM) => void;
  onAddTask?: () => void | Promise<void>;
  /** Where "Voir dans l'atelier" leads for a stock item. */
  workshopItemHref?: (itemId: number) => string;
};

function Lead({ rule, withBike }: { rule: RuleRowVM; withBike: boolean }) {
  if (withBike)
    return <BikeCover cover={rule.bike.cover} bare className="size-11 rounded-[11px]" />;
  const Icon = CATEGORY_ICONS[rule.slot?.group ?? "frame"];
  return (
    <span className="grid size-11 place-items-center rounded-[11px] bg-surface-2 text-fg-muted [&_svg]:size-[18px]">
      <Icon aria-hidden />
    </span>
  );
}

const rowClasses =
  "grid grid-cols-[44px_minmax(0,1fr)] gap-x-3 px-4 py-3.5 md:grid-cols-[44px_minmax(0,1fr)_auto]";
const actionsClasses =
  "col-start-2 mt-3 flex gap-2 md:col-start-3 md:row-start-1 md:mt-0 md:ml-2 md:flex-col md:self-center";

function RuleRow({
  rule,
  today,
  withBike,
  actions,
}: {
  rule: RuleRowVM;
  today: LocalDate;
  withBike: boolean;
  actions: PlanActions;
}) {
  const context = [
    withBike ? rule.bike.name : null,
    rule.slot ? [rule.slot.typeLabel, rule.slot.model].filter(Boolean).join(" · ") : "Vélo entier",
  ]
    .filter(Boolean)
    .join(" · ");
  const note = ruleNote(rule, today);
  const lastDone =
    !withBike && rule.lastDoneOn
      ? `fait le ${formatDate(rule.lastDoneOn, { month: "short", year: "auto", today })}`
      : null;
  const used = formatQuantity(rule.used);
  const interval = formatQuantity(rule.interval);
  const stock = rule.stock;

  return (
    <li className={rowClasses}>
      <Lead rule={rule} withBike={withBike} />
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] text-fg-muted">{context}</span>
          <RuleStatusBadge status={rule.status} />
        </div>
        <h3 className="mt-[3px] mb-2.5 text-[15px] leading-[1.35] font-semibold">{rule.title}</h3>
        <WearBar
          ratio={rule.ratio}
          warnRatio={rule.warnRatio}
          status={rule.status}
          label={`${used} sur ${interval}`}
        />
        <div className="mt-2 flex flex-wrap justify-between gap-x-2.5 gap-y-0.5 text-[13px] text-fg-muted">
          <span>
            <span className="num text-base font-semibold text-fg">{used}</span> / {interval}
          </span>
          {note || lastDone ? <span>{[note, lastDone].filter(Boolean).join(" · ")}</span> : null}
        </div>
        {stock ? (
          <p className="mt-2 text-[13px] text-fg-muted [&_svg]:mr-1.5 [&_svg]:inline [&_svg]:size-[15px] [&_svg]:align-[-3px]">
            {stock.state ? <PackageX aria-hidden /> : <PackageCheck aria-hidden />}
            {stock.name} : {formatStock(stock.quantity, stock.unit)}
            {stock.state ? ` · ${REBUY_STATE_LABELS[stock.state].toLowerCase()}` : ""}
            {actions.workshopItemHref ? (
              <>
                {" "}
                <Button variant="link" asChild className="text-[13px]">
                  <Link href={actions.workshopItemHref(stock.itemId)}>
                    Voir dans l&apos;atelier
                  </Link>
                </Button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      {rule.status !== "ok" ? (
        <div className={actionsClasses}>
          <ActionButton
            variant="secondary"
            size="sm"
            action={actions.onRuleDone}
            payload={rule}
            aria-label={`C'est fait : ${rule.title}, ${rule.bike.name}`}
          >
            <Check />
            C&apos;est fait
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="sm"
            action={actions.onRuleSnooze}
            payload={rule}
            aria-label={`Reporter : ${rule.title}, ${rule.bike.name}`}
          >
            <CalendarClock />
            Reporter
          </ActionButton>
        </div>
      ) : null}
    </li>
  );
}

function TaskRow({
  task,
  today,
  withBike,
  actions,
}: {
  task: TaskRowVM;
  today: LocalDate;
  withBike: boolean;
  actions: PlanActions;
}) {
  return (
    <li className={rowClasses}>
      {withBike && task.bike ? (
        <BikeCover cover={task.bike.cover} bare className="size-11 rounded-[11px]" />
      ) : (
        <span className="grid size-11 place-items-center rounded-[11px] bg-surface-2 text-fg-muted">
          <ListChecks className="size-[18px]" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] text-fg-muted">
            {withBike ? `${task.bike?.name ?? "Général"} · ` : ""}Tâche ponctuelle
          </span>
          <Badge>
            <ListChecks aria-hidden />
            Tâche
          </Badge>
        </div>
        <h3 className="mt-[3px] mb-1 text-[15px] leading-[1.35] font-semibold">{task.title}</h3>
        <p className="text-[13px] text-fg-muted">
          {task.dueOn
            ? `Avant le ${formatDate(task.dueOn, { year: "auto", today })}`
            : "Sans échéance"}
        </p>
      </div>
      <div className={actionsClasses}>
        {actions.onTaskEdit ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Modifier « ${task.title} »`}
            onClick={() => actions.onTaskEdit?.(task)}
          >
            <Pencil />
            Modifier
          </Button>
        ) : null}
        <ActionButton
          variant="secondary"
          size="sm"
          action={actions.onTaskDone}
          payload={task}
          aria-label={`Marquer « ${task.title} » comme faite`}
        >
          <Check />
          Fait
        </ActionButton>
      </div>
    </li>
  );
}

/** "À prévoir": rules first (most urgent first), then one-off tasks (D-34). */
export function PlanList({
  rules,
  tasks,
  today,
  withBike,
  actions,
  className,
}: {
  rules: RuleRowVM[];
  tasks: TaskRowVM[];
  today: LocalDate;
  /** Dashboard: each row names its bike and shows its cover. */
  withBike: boolean;
  actions: PlanActions;
  className?: string;
}) {
  return (
    <Card asChild className={cn("overflow-hidden", className)}>
      <ul data-focus-scope className="m-0 list-none divide-y divide-border p-0">
        {rules.map((rule) => (
          <RuleRow
            key={`r${rule.id}`}
            rule={rule}
            today={today}
            withBike={withBike}
            actions={actions}
          />
        ))}
        {tasks.map((task) => (
          <TaskRow
            key={`t${task.id}`}
            task={task}
            today={today}
            withBike={withBike}
            actions={actions}
          />
        ))}
        {rules.length + tasks.length === 0 ? (
          <li className="px-4 py-3 text-[13px] text-fg-muted">
            Rien à prévoir pour l&apos;instant.
          </li>
        ) : null}
        {actions.onAddTask ? (
          <li className="px-2 py-1.5">
            <ActionButton
              variant="ghost"
              size="sm"
              action={actions.onAddTask}
              payload={undefined}
              data-focus-fallback
            >
              <Plus />
              Ajouter une tâche
            </ActionButton>
          </li>
        ) : null}
      </ul>
    </Card>
  );
}
