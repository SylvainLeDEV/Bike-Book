"use client";

import * as React from "react";
import { cn } from "cn";
import { BadgeCheck, ChevronRight, Plus, Replace } from "lucide-react";
import { CATEGORY_ICONS } from "@/components/icons";
import { PhotoThumbs } from "@/components/photos/photo-thumbs";
import { RuleStatusMark } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SegmentedTabs,
  SegmentedTabsContent,
  SegmentedTabsList,
  SegmentedTabsTrigger,
} from "@/components/ui/segmented-tabs";
import { formatQuantity } from "@/lib/display";
import { formatCount, formatDate, type LocalDate } from "@/lib/format";
import { COMPONENT_GROUP_LABELS, REMOVAL_REASON_LABELS } from "@/lib/labels";
import type { ComponentGroupVM, ComponentVM } from "@/lib/view-models";

function sinceText(component: ComponentVM, today: LocalDate) {
  return component.installedOn
    ? `depuis le ${formatDate(component.installedOn, { month: "short", year: "auto", today })}`
    : "d'origine";
}

function GroupHead({ group }: { group: ComponentGroupVM["group"] }) {
  const Icon = CATEGORY_ICONS[group];
  return (
    <h3 className="flex items-center gap-2 px-4 pt-3.5 pb-1.5 eyebrow [&_svg]:size-[15px]">
      <Icon aria-hidden />
      {COMPONENT_GROUP_LABELS[group]}
    </h3>
  );
}

type RowProps = {
  component: ComponentVM;
  today: LocalDate;
  onEdit?: (componentId: number) => void;
};

function FittedRow({ component, today, onEdit }: RowProps) {
  // The whole row opens the sheet, through a button laid over it; the thumbnails sit above
  // that button (a button cannot contain the thumbnails' own buttons).
  return (
    <li
      className={
        onEdit
          ? "relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[color-mix(in_oklch,var(--surface-2),var(--surface)_40%)]"
          : "flex items-center gap-3 px-4 py-2.5"
      }
    >
      {onEdit ? (
        <button
          type="button"
          onClick={() => onEdit(component.id)}
          aria-label={`Modifier ${component.typeLabel} : ${component.model}`}
          className="absolute inset-0 focus-visible:-outline-offset-3"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[14.5px] font-semibold">
          {component.typeLabel}
          {component.status && component.status !== "ok" ? (
            <RuleStatusMark status={component.status} />
          ) : null}
        </p>
        <p className="truncate text-[13px] text-fg-muted">{component.model}</p>
        {component.photos.length ? (
          <div className="relative z-10 w-fit">
            <PhotoThumbs photos={component.photos} title={component.typeLabel} />
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <span className="num text-[17px] font-semibold">{formatQuantity(component.counter)}</span>
        <span className="block text-xs text-fg-muted">{sinceText(component, today)}</span>
      </div>
      {onEdit ? <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden /> : null}
    </li>
  );
}

function OriginRow({ component, today }: RowProps) {
  const count = component.lineage.length;
  return (
    <li className="block px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14.5px] font-semibold">{component.typeLabel}</p>
        {count ? (
          <Badge variant="outline">
            <Replace aria-hidden />
            {count} remplacement{count > 1 ? "s" : ""}
          </Badge>
        ) : (
          <Badge>
            <BadgeCheck aria-hidden />
            D&apos;origine
          </Badge>
        )}
      </div>
      {count ? (
        <ol
          aria-label="Pièces successives, de l'origine à aujourd'hui"
          className="m-0 mt-2 list-none p-0"
        >
          {component.lineage.map((part, index) => (
            <li
              key={`${part.removedOn}-${index}`}
              className="relative pb-3 pl-[22px] text-[13px] text-fg-muted before:absolute before:top-[5px] before:left-[3px] before:size-2.5 before:rounded-full before:bg-surface before:shadow-[inset_0_0_0_2px_var(--fg-muted)] after:absolute after:top-[18px] after:bottom-0.5 after:left-[7.5px] after:w-px after:bg-border"
            >
              <span className="block text-sm font-semibold text-fg">
                {part.model}
                {index === 0 ? <span className="hint font-normal"> · d&apos;origine</span> : null}
              </span>
              <span className="mt-0.5 block">
                Remplacement le {formatDate(part.removedOn, { month: "short" })}, après{" "}
                {formatQuantity(part.wearAtRemoval)} ·{" "}
                <b className="font-semibold text-fg">{REMOVAL_REASON_LABELS[part.reason]}</b>
                {part.note ? ` : ${part.note}` : ""}
              </span>
              <PhotoThumbs
                photos={part.photos}
                title={`${component.typeLabel} retiré le ${formatDate(part.removedOn, { month: "short" })}`}
              />
            </li>
          ))}
          <li className="relative pl-[22px] text-[13px] text-fg-muted before:absolute before:top-[5px] before:left-[3px] before:size-2.5 before:rounded-full before:bg-brand">
            <span className="block text-sm font-semibold text-fg">{component.model}</span>
            <span className="mt-0.5 block">
              Montée aujourd&apos;hui · {formatQuantity(component.counter)}{" "}
              {sinceText(component, today)}
            </span>
          </li>
        </ol>
      ) : (
        <p className="truncate text-[13px] text-fg-muted">{component.model} · toujours en place</p>
      )}
    </li>
  );
}

/**
 * Components: "Monté aujourd'hui", or the original spec followed down to today's parts, with
 * when and why each one was replaced (D-43).
 */
export function ComponentsSection({
  groups,
  purchasedOn,
  today,
  onAdd,
  onEdit,
}: {
  groups: ComponentGroupVM[];
  purchasedOn: LocalDate | null;
  today: LocalDate;
  /** "Ajouter un composant". */
  onAdd?: () => void;
  /** Opens a fitted part in the component sheet. */
  onEdit?: (componentId: number) => void;
}) {
  const [view, setView] = React.useState<"fitted" | "origin">("fitted");
  const all = groups.flatMap((g) => g.components);
  const replacements = all.reduce((n, c) => n + c.lineage.length, 0);
  const hint =
    view === "fitted"
      ? formatCount(all.length, "pièce suivie", "pièces suivies")
      : `${purchasedOn ? `À l'achat le ${formatDate(purchasedOn, { month: "short" })} · ` : ""}${formatCount(replacements, "remplacement", "remplacements")}`;

  const list = (Row: typeof FittedRow) => (
    <Card className="overflow-hidden">
      {groups.length ? null : (
        <div className="grid justify-items-start gap-2 px-4 py-3">
          <p className="text-[13px] text-fg-muted">
            Aucun composant noté pour l&apos;instant. Commence par les pièces qui s&apos;usent :
            fourche, amortisseur, chaîne, plaquettes, pneus.
          </p>
          {onAdd ? (
            <Button variant="secondary" size="sm" onClick={onAdd}>
              <Plus />
              Ajouter un composant
            </Button>
          ) : null}
        </div>
      )}
      {groups.map((group, index) => (
        <div key={group.group} className={cn(index > 0 && "border-t border-border")}>
          <GroupHead group={group.group} />
          <ul className="m-0 list-none divide-y divide-border p-0 pb-1.5">
            {group.components.map((component) => (
              <Row key={component.id} component={component} today={today} onEdit={onEdit} />
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );

  return (
    <section aria-labelledby="bike-components-title">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 id="bike-components-title" className="text-[17px] font-semibold tracking-[-0.01em]">
          Composants
        </h2>
        <span className="ml-auto hint" aria-live="polite">
          {hint}
        </span>
        {onAdd && groups.length ? (
          <Button variant="link" onClick={onAdd}>
            Ajouter
          </Button>
        ) : null}
      </div>
      <SegmentedTabs value={view} onValueChange={(v) => setView(v as "fitted" | "origin")}>
        <SegmentedTabsList aria-label="Vue des composants" className="mb-3">
          <SegmentedTabsTrigger value="fitted">Monté aujourd&apos;hui</SegmentedTabsTrigger>
          <SegmentedTabsTrigger value="origin">Fiche d&apos;origine</SegmentedTabsTrigger>
        </SegmentedTabsList>
        <SegmentedTabsContent value="fitted">{list(FittedRow)}</SegmentedTabsContent>
        <SegmentedTabsContent value="origin">{list(OriginRow)}</SegmentedTabsContent>
      </SegmentedTabs>
    </section>
  );
}
