import Link from "next/link";
import { cn } from "cn";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardCheck,
  Play,
  ListChecks,
  ListOrdered,
  PackageCheck,
  PackageX,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import { BikeCover } from "@/components/bike-cover";
import { CATEGORY_ICONS } from "@/components/icons";
import { RuleStatusBadge, WearBar } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatItemStock, formatQuantity, ruleNote } from "@/lib/display";
import { formatDate, type LocalDate } from "@/lib/format";
import { REBUY_STATE_LABELS } from "@/lib/labels";
import type { ProcedureRef, RuleRowVM, RunRowVM, TaskRowVM } from "@/lib/view-models";
import { ActionButton } from "./action-button";

export type PlanActions = {
  onRuleDone?: (rule: RuleRowVM) => void | Promise<void>;
  /** "Reporter" until a day; on a snoozed rule, "Changer la date" (D-105). */
  onRuleSnooze?: (rule: RuleRowVM) => void | Promise<void>;
  /** "Réactiver" a snoozed rule: back in the due list at once (D-105). */
  onRuleReactivate?: (rule: RuleRowVM) => void | Promise<void>;
  onTaskDone?: (task: TaskRowVM) => void | Promise<void>;
  /** "Modifier la tâche": its fields and its attachments (feature 10). */
  onTaskEdit?: (task: TaskRowVM) => void;
  onAddTask?: () => void | Promise<void>;
  /** Where "Voir dans l'atelier" leads for a stock item. */
  workshopItemHref?: (itemId: number) => string;
  /** Where "Fiche : …" leads (D-86): the procedure, prepared for that bike. */
  procedureHref?: (procedureId: number, bikeId: number | null) => string;
  /** "Commencer la fiche" on a rule, "Commencer" on a task with a procedure (D-87). */
  onStartRule?: (rule: RuleRowVM) => void | Promise<void>;
  onStartTask?: (task: TaskRowVM) => void | Promise<void>;
  /** Where "Reprendre" leads: the run's page. */
  runHref?: (runId: number) => string;
};

/** "En cours": a run started and not finished (D-87). Neutral, wear colours stay reserved. */
function RunningBadge() {
  return (
    <Badge variant="outline">
      <ClipboardCheck aria-hidden />
      En cours
    </Badge>
  );
}

function ResumeButton({
  runId,
  label,
  actions,
}: {
  runId: number;
  label: string;
  actions: PlanActions;
}) {
  return actions.runHref ? (
    <Button variant="secondary" size="sm" asChild>
      <Link href={actions.runHref(runId)} aria-label={`Reprendre : ${label}`}>
        <Play />
        Reprendre
      </Link>
    </Button>
  ) : null;
}

/** "Fiche : Purge des freins" under a rule or a task that points to a procedure (D-86). */
function ProcedureLine({
  procedure,
  bikeId,
  actions,
}: {
  procedure: ProcedureRef;
  bikeId: number | null;
  actions: PlanActions;
}) {
  return (
    <p className="mt-2 text-[13px] text-fg-muted [&_svg]:mr-1.5 [&_svg]:inline [&_svg]:size-[15px] [&_svg]:align-[-3px]">
      <ListOrdered aria-hidden />
      Fiche :{" "}
      {actions.procedureHref ? (
        <Button variant="link" asChild className="text-[13px]">
          <Link href={actions.procedureHref(procedure.id, bikeId)}>{procedure.title}</Link>
        </Button>
      ) : (
        procedure.title
      )}
    </p>
  );
}

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
  "col-start-2 mt-3 flex flex-wrap gap-2 md:col-start-3 md:row-start-1 md:mt-0 md:ml-2 md:flex-col md:self-center";

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
  const snoozed = rule.status === "snoozed";

  return (
    <li className={rowClasses}>
      <Lead rule={rule} withBike={withBike} />
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] text-fg-muted">{context}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {rule.run ? <RunningBadge /> : null}
            <RuleStatusBadge status={rule.status} />
          </span>
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
            {stock.name} : {formatItemStock(stock)}
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
        {rule.procedure ? (
          <ProcedureLine procedure={rule.procedure} bikeId={rule.bike.id} actions={actions} />
        ) : null}
      </div>
      {rule.run ? (
        <div className={actionsClasses}>
          <ResumeButton runId={rule.run.id} label={rule.title} actions={actions} />
        </div>
      ) : rule.status !== "ok" ? (
        <div className={actionsClasses}>
          {rule.procedure && actions.onStartRule ? (
            // A rule with a procedure (D-47, D-87): follow it, or record it at once.
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`C'est fait : ${rule.title}, ${rule.bike.name}`}
                >
                  <Check />
                  C&apos;est fait
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void actions.onStartRule?.(rule)}>
                  <Play />
                  Commencer la fiche
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void actions.onRuleDone?.(rule)}>
                  <Check />
                  Enregistrer directement
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
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
          )}
          <ActionButton
            variant="ghost"
            size="sm"
            action={actions.onRuleSnooze}
            payload={rule}
            aria-label={`${snoozed ? "Changer la date du report" : "Reporter"} : ${rule.title}, ${rule.bike.name}`}
          >
            <CalendarClock />
            {snoozed ? "Changer la date" : "Reporter"}
          </ActionButton>
          {snoozed && actions.onRuleReactivate ? (
            <ActionButton
              variant="ghost"
              size="sm"
              action={actions.onRuleReactivate}
              payload={rule}
              aria-label={`Réactiver : ${rule.title}, ${rule.bike.name}`}
            >
              <RotateCcw />
              Réactiver
            </ActionButton>
          ) : null}
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
          {task.run ? (
            <RunningBadge />
          ) : (
            <Badge>
              <ListChecks aria-hidden />
              Tâche
            </Badge>
          )}
        </div>
        <h3 className="mt-[3px] mb-1 text-[15px] leading-[1.35] font-semibold">{task.title}</h3>
        <p className="text-[13px] text-fg-muted">
          {task.dueOn
            ? `Avant le ${formatDate(task.dueOn, { year: "auto", today })}`
            : "Sans échéance"}
        </p>
        {task.procedure ? (
          <ProcedureLine
            procedure={task.procedure}
            bikeId={task.bike?.id ?? null}
            actions={actions}
          />
        ) : null}
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
        {task.run ? (
          <ResumeButton runId={task.run.id} label={task.title} actions={actions} />
        ) : (
          <>
            {task.procedure && actions.onStartTask ? (
              <ActionButton
                variant="secondary"
                size="sm"
                action={actions.onStartTask}
                payload={task}
                aria-label={`Commencer « ${task.title} »`}
              >
                <Play />
                Commencer
              </ActionButton>
            ) : null}
            <ActionButton
              variant={task.procedure && actions.onStartTask ? "ghost" : "secondary"}
              size="sm"
              action={actions.onTaskDone}
              payload={task}
              aria-label={`Marquer « ${task.title} » comme faite`}
            >
              <Check />
              Fait
            </ActionButton>
          </>
        )}
      </div>
    </li>
  );
}

/** A run started from a procedure alone (D-87): its own row while in progress. */
function RunRow({
  run,
  withBike,
  actions,
}: {
  run: RunRowVM;
  withBike: boolean;
  actions: PlanActions;
}) {
  return (
    <li className={rowClasses}>
      {withBike && run.bike ? (
        <BikeCover cover={run.bike.cover} bare className="size-11 rounded-[11px]" />
      ) : (
        <span className="grid size-11 place-items-center rounded-[11px] bg-surface-2 text-fg-muted">
          <ClipboardCheck className="size-[18px]" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] text-fg-muted">
            {withBike && run.bike ? `${run.bike.name} · ` : ""}Suivi d&apos;une fiche
          </span>
          <RunningBadge />
        </div>
        <h3 className="mt-[3px] mb-1 text-[15px] leading-[1.35] font-semibold">{run.title}</h3>
        <p className="text-[13px] text-fg-muted">
          {run.stepCount
            ? `${run.doneCount} étape${run.doneCount > 1 ? "s" : ""} faite${run.doneCount > 1 ? "s" : ""} sur ${run.stepCount}`
            : "Pas encore d'étape"}
        </p>
      </div>
      <div className={actionsClasses}>
        <ResumeButton runId={run.id} label={run.title} actions={actions} />
      </div>
    </li>
  );
}

/** "À prévoir": rules first (most urgent first), then one-off tasks (D-34). */
export function PlanList({
  rules,
  tasks,
  runs = [],
  today,
  withBike,
  actions,
  className,
}: {
  rules: RuleRowVM[];
  tasks: TaskRowVM[];
  /** Runs in progress started from a procedure alone (D-87). */
  runs?: RunRowVM[];
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
        {runs.map((run) => (
          <RunRow key={`s${run.id}`} run={run} withBike={withBike} actions={actions} />
        ))}
        {rules.length + tasks.length + runs.length === 0 ? (
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
