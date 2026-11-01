"use client";

import * as React from "react";
import { Pencil, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoPopover } from "@/components/ui/info-popover";
import {
  SegmentedTabs,
  SegmentedTabsContent,
  SegmentedTabsList,
  SegmentedTabsTrigger,
} from "@/components/ui/segmented-tabs";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatInteger, withUnit, type LocalDate } from "@/lib/format";
import { DAMPER_ADJUSTER_LABELS, SETUP_UNIT_LABELS, SPRING_TYPE_LABELS } from "@/lib/labels";
import { decimalText } from "@/lib/parse";
import {
  adjustersOf,
  formatBar,
  formatMillimetres,
  formatPsi,
  formatSagTargetMm,
  formatSagTargetPercent,
  formatSpringRate,
  sagPercent,
  setupPrefill,
  valuesOf,
} from "@/lib/setup";
import {
  ADVICE_SOURCES,
  CLICKS_CONVENTION,
  adviceFor,
  sagTargetOf,
  type AdviceSourceId,
} from "@/lib/setup-advice";
import type {
  SaveSetupResult,
  SetupEntryVM,
  SetupInput,
  SetupTabVM,
  SuspensionSpecsInput,
  SuspensionUnitVM,
} from "@/lib/view-models";
import { SagHowTo } from "./sag-how-to";
import { SetupSheet, type SetupSheetMode, type SetupUnitView } from "./setup-sheet";
import { SuspensionSpecsSheet } from "./suspension-specs-sheet";

/*
 * The bike page's "Réglages" tab (D-79, D-83): the fork, the rear shock and the tyres one at a time
 * (a segmented control). A suspension part shows its current values, its sag against the target,
 * its adjusters against their range, and short advice; "Modifier" sets its travel and the clicks of
 * each adjuster. Then the setup log, newest first, with what each setup changed.
 */

export type SetupActions = {
  onCreate?: (input: SetupInput) => Promise<SaveSetupResult>;
  onUpdate?: (setupId: number, input: SetupInput) => Promise<SaveSetupResult>;
  onDelete?: (setupId: number) => Promise<SaveSetupResult>;
  /** "Débattement et molettes": what a fork or rear shock is (D-83). */
  onSaveSpecs?: (componentId: number, specs: SuspensionSpecsInput) => Promise<SaveSetupResult>;
};

function SectionTitle({
  id,
  children,
  side,
}: {
  id: string;
  children: React.ReactNode;
  side?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2
        id={id}
        tabIndex={-1}
        className="text-[17px] font-semibold tracking-[-0.01em] outline-none"
      >
        {children}
      </h2>
      {side}
    </div>
  );
}

/** A fork or shock is described once its travel or one of its adjusters is known. */
function isDescribed(unit: SuspensionUnitVM): boolean {
  return Boolean(unit.specs && (unit.specs.travelMm != null || adjustersOf(unit.specs).length));
}

export function SetupSection({
  vm,
  bikeName,
  today,
  actions,
}: {
  vm: SetupTabVM;
  bikeName: string;
  today: LocalDate;
  actions: SetupActions;
}) {
  const toast = useToast();
  const views: SetupUnitView[] = [...vm.units.map((unit) => unit.typeCode), "tires"];
  const [view, setView] = React.useState<SetupUnitView>(views[0]);
  const [sheet, setSheet] = React.useState<{ open: boolean; mode: SetupSheetMode | null }>({
    open: false,
    mode: null,
  });
  const [specsSheet, setSpecsSheet] = React.useState<{
    open: boolean;
    unit: SuspensionUnitVM | null;
  }>({ open: false, unit: null });
  const current = vm.entries[0] ?? null;
  const canWrite = Boolean(actions.onCreate);
  const editSpecs = actions.onSaveSpecs
    ? (unit: SuspensionUnitVM) => setSpecsSheet({ open: true, unit })
    : undefined;

  const openNew = (unit: SetupUnitView, restore?: SetupEntryVM) => {
    const { values, skipped } = setupPrefill(
      vm.units,
      current?.values ?? null,
      today,
      restore?.values ?? null,
    );
    setSheet({
      open: true,
      mode: {
        kind: "new",
        values,
        unit,
        restoredFrom: restore ? { setOn: restore.setOn, label: restore.label, skipped } : undefined,
      },
    });
  };

  return (
    <section aria-labelledby="bike-setup-title">
      <SectionTitle
        id="bike-setup-title"
        side={
          canWrite ? (
            <Button size="sm" onClick={() => openNew(view)}>
              <Plus />
              Nouveau réglage
            </Button>
          ) : null
        }
      >
        Réglages
      </SectionTitle>
      <p className="-mt-1 mb-3 text-[13px] text-fg-muted">
        {current
          ? `Réglage actuel depuis le ${formatDate(current.setOn, { year: "auto", today })}${current.label ? ` · « ${current.label} »` : ""}`
          : "Aucun réglage noté pour l'instant."}
      </p>

      <div className="grid gap-[26px] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-x-7">
        <div className="grid min-w-0 gap-4">
          <SegmentedTabs value={view} onValueChange={(value) => setView(value as SetupUnitView)}>
            {views.length > 1 ? (
              <SegmentedTabsList
                aria-label="Partie du vélo"
                className="mb-3 md:w-fit [&>button]:md:px-5"
              >
                {views.map((v) => (
                  <SegmentedTabsTrigger key={v} value={v}>
                    {SETUP_UNIT_LABELS[v]}
                  </SegmentedTabsTrigger>
                ))}
              </SegmentedTabsList>
            ) : null}
            {vm.units.map((unit) => (
              <SegmentedTabsContent
                key={unit.componentId}
                value={unit.typeCode}
                className="grid gap-4"
              >
                <UnitPanel
                  unit={unit}
                  current={current}
                  onChange={canWrite ? () => openNew(unit.typeCode) : undefined}
                  onEditSpecs={editSpecs ? () => editSpecs(unit) : undefined}
                />
                <AdvicePanel unit={unit} />
              </SegmentedTabsContent>
            ))}
            <SegmentedTabsContent value="tires">
              <TiresPanel
                current={current}
                onChange={canWrite ? () => openNew("tires") : undefined}
              />
            </SegmentedTabsContent>
          </SegmentedTabs>
          {vm.rigidFork ? (
            <p className="text-[13px] text-fg-muted">
              Fourche rigide : {vm.rigidFork.name}.{" "}
              {editSpecs ? (
                <Button
                  variant="link"
                  className="text-[13px]"
                  onClick={() =>
                    editSpecs({
                      componentId: vm.rigidFork!.componentId,
                      typeCode: "fork",
                      name: vm.rigidFork!.name,
                      specs: null,
                    })
                  }
                >
                  Elle est suspendue ?
                </Button>
              ) : null}
            </p>
          ) : null}
        </div>

        <section aria-labelledby="bike-setup-history-title" className="min-w-0">
          <SectionTitle id="bike-setup-history-title">Historique des réglages</SectionTitle>
          {vm.entries.length ? (
            <Card asChild className="overflow-hidden">
              <ol className="m-0 list-none divide-y divide-border p-0">
                {vm.entries.map((entry, index) => (
                  <HistoryEntry
                    key={entry.id}
                    entry={entry}
                    current={index === 0}
                    today={today}
                    onEdit={
                      actions.onUpdate
                        ? () =>
                            setSheet({
                              open: true,
                              mode: {
                                kind: "edit",
                                id: entry.id,
                                values: entry.values,
                                unit: view,
                              },
                            })
                        : undefined
                    }
                    onRestore={canWrite && index > 0 ? () => openNew(view, entry) : undefined}
                  />
                ))}
              </ol>
            </Card>
          ) : (
            <EmptyState compact title="Aucun réglage enregistré">
              Chaque réglage que tu notes reste daté : tu pourras revenir à un réglage qui marchait.
            </EmptyState>
          )}
        </section>
      </div>

      <SetupSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((state) => ({ ...state, open }))}
        bikeName={bikeName}
        units={vm.units}
        today={today}
        mode={sheet.mode}
        onSubmit={async (mode, input) => {
          const result =
            mode.kind === "edit"
              ? ((await actions.onUpdate?.(mode.id, input)) ?? {
                  ok: false,
                  error: "Indisponible.",
                })
              : ((await actions.onCreate?.(input)) ?? { ok: false, error: "Indisponible." });
          if (result.ok) toast(result.message);
          return result;
        }}
        onDelete={
          actions.onDelete
            ? async (id) => {
                const result = await actions.onDelete!(id);
                if (result.ok) toast(result.message);
                return result;
              }
            : undefined
        }
      />
      <SuspensionSpecsSheet
        open={specsSheet.open}
        onOpenChange={(open) => setSpecsSheet((state) => ({ ...state, open }))}
        unit={specsSheet.unit}
        onSubmit={async (componentId, specs) => {
          const result = (await actions.onSaveSpecs?.(componentId, specs)) ?? {
            ok: false,
            error: "Indisponible.",
          };
          if (result.ok) toast(result.message);
          return result;
        }}
      />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-surface px-3.5 py-3">
      <div className="num text-[22px] leading-none font-bold">{value ?? "–"}</div>
      <div className="mt-1.5 text-[13px] text-fg-muted">{label}</div>
    </div>
  );
}

function UnitPanel({
  unit,
  current,
  onChange,
  onEditSpecs,
}: {
  unit: SuspensionUnitVM;
  current: SetupEntryVM | null;
  onChange?: () => void;
  onEditSpecs?: () => void;
}) {
  const values = valuesOf(current?.values ?? null, unit.componentId);
  const adjusters = adjustersOf(unit.specs);
  const coil = unit.specs?.springType === "coil";
  const travel = unit.specs?.travelMm ?? null;
  const partLabel = SETUP_UNIT_LABELS[unit.typeCode].toLowerCase();
  const meta = [
    unit.specs ? SPRING_TYPE_LABELS[unit.specs.springType] : null,
    travel != null
      ? `${decimalText(travel, 1)} mm ${unit.typeCode === "fork" ? "de débattement" : "de course"}`
      : null,
    adjusters.length ? `${adjusters.length} molette${adjusters.length > 1 ? "s" : ""}` : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          <h3 className="text-[15px] leading-snug font-semibold">{unit.name}</h3>
          <p className="text-[13px] text-fg-muted">
            {meta.length
              ? meta.map((part, index) => (
                  <React.Fragment key={part}>
                    {index ? " · " : null}
                    <span className="whitespace-nowrap">{part}</span>
                  </React.Fragment>
                ))
              : "Débattement et molettes à renseigner"}
          </p>
        </div>
        {onEditSpecs ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Modifier le débattement et les molettes : ${unit.name}`}
            onClick={onEditSpecs}
          >
            <Pencil />
            Modifier
          </Button>
        ) : null}
      </div>

      {isDescribed(unit) ? null : (
        <div className="mx-4 mb-3.5 grid gap-2.5 rounded-control bg-surface-2 px-3.5 py-3 text-[13.5px] leading-snug">
          <p>
            Indique {unit.typeCode === "fork" ? "son débattement" : "sa course"} et le nombre de
            clics de chaque molette : tu verras ton SAG en % et où tu en es sur chaque molette.
          </p>
          {onEditSpecs ? (
            <div>
              <Button variant="secondary" size="sm" onClick={onEditSpecs}>
                <SlidersHorizontal />
                Renseigner {unit.typeCode === "fork" ? "la fourche" : "l'amortisseur"}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {values ? (
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border">
          {coil ? (
            <Stat
              label="Ressort"
              value={
                values.springRateLbPerIn != null ? formatSpringRate(values.springRateLbPerIn) : null
              }
            />
          ) : (
            <>
              <Stat
                label="Pression"
                value={values.airPressurePsi != null ? formatPsi(values.airPressurePsi) : null}
              />
              <Stat
                label="Tokens"
                value={values.volumeSpacers != null ? formatInteger(values.volumeSpacers) : null}
              />
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-2.5 border-t border-border px-4 py-3.5">
          <p className="text-[13.5px] text-fg-muted">
            Pas encore de réglage noté pour{" "}
            {unit.typeCode === "fork" ? "cette fourche" : "cet amortisseur"} : pression, tokens,
            SAG, clics.
          </p>
          {onChange ? (
            <div>
              <Button size="sm" onClick={onChange}>
                <Plus />
                Noter le réglage
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <SagBlock unit={unit} sagMm={values?.sagMm ?? null} />

      {adjusters.length ? (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-fg-muted">
            Molettes · clics depuis fermé
            <InfoPopover label="Comment compter les clics">{CLICKS_CONVENTION}</InfoPopover>
          </p>
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {adjusters.map(({ code, maxClicks }) => (
              <li key={code}>
                <ClickGauge
                  label={DAMPER_ADJUSTER_LABELS[code]}
                  clicks={values?.clicks[code] ?? null}
                  max={maxClicks}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {values && onChange ? (
        <div className="border-t border-border px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onChange}
            aria-label={`Changer le réglage : ${partLabel}`}
          >
            <SlidersHorizontal />
            Changer le réglage
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * The sag: measured value in mm and in % of the part's travel, on a scale with the target zone,
 * and the target in % and in mm for this part (D-83).
 */
function SagBlock({ unit, sagMm }: { unit: SuspensionUnitVM; sagMm: number | null }) {
  const travel = unit.specs?.travelMm ?? null;
  const target = sagTargetOf(unit.typeCode, unit.specs?.springType ?? null);
  const percent = sagPercent(sagMm, travel);
  const targetMm = formatSagTargetMm(target, travel);
  const of = unit.typeCode === "fork" ? "du débattement" : "de la course";
  // Scale: 0 to 50 %, wider when the sag goes beyond.
  const scale = Math.max(50, Math.ceil(((percent ?? 0) + 5) / 10) * 10);
  const at = (value: number) => `${(Math.min(value, scale) / scale) * 100}%`;
  const single = target.minPercent === target.maxPercent;

  return (
    <div className="grid gap-2 border-t border-border px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1 text-[13px] font-semibold text-fg-muted">
          SAG
          <SagHowTo typeCode={unit.typeCode} />
        </span>
        <span className="text-right">
          <span className="num text-[22px] leading-none font-bold">
            {sagMm != null ? formatMillimetres(sagMm) : "–"}
          </span>
          {percent != null ? (
            <span className="ml-1.5 text-[14px] text-fg-muted">
              ·{" "}
              <span className="num text-[17px] font-semibold text-fg">
                {formatInteger(percent)}
              </span>
              {" "}% {of}
            </span>
          ) : null}
        </span>
      </div>
      {travel != null ? (
        <div className="grid gap-1">
          <div
            role="img"
            aria-label={`${percent != null ? `SAG à ${formatInteger(percent)} %` : "SAG pas noté"} ; repère ${formatSagTargetPercent(target)} ${of}`}
            className="relative h-2.5 rounded-full bg-surface-2"
          >
            <span
              className="absolute inset-y-0 rounded-full bg-[color-mix(in_oklch,var(--brand),transparent_60%)]"
              style={{
                left: at(single ? target.minPercent - 0.75 : target.minPercent),
                width: `${((single ? 1.5 : target.maxPercent - target.minPercent) / scale) * 100}%`,
              }}
            />
            {percent != null ? (
              <span
                className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand"
                style={{ left: at(percent) }}
              />
            ) : null}
          </div>
          {/* The target's edges under the scale. */}
          <div aria-hidden className="relative h-4 text-[11.5px] text-fg-muted">
            <span className="absolute left-0">0</span>
            {(single ? [target.minPercent] : [target.minPercent, target.maxPercent]).map(
              (value) => (
                <span key={value} className="absolute -translate-x-1/2" style={{ left: at(value) }}>
                  {value}
                </span>
              ),
            )}
            <span className="absolute right-0">{scale} %</span>
          </div>
        </div>
      ) : null}
      <p className="text-[13px] text-fg-muted">
        Repère FOX : {formatSagTargetPercent(target)} {of}
        {targetMm ? (
          <>
            , soit <span className="whitespace-nowrap">{targetMm}</span>
          </>
        ) : null}
        .
        {travel == null
          ? ` Indique ${unit.typeCode === "fork" ? "le débattement" : "la course"} (Modifier) pour voir ton %.`
          : ""}
      </p>
    </div>
  );
}

/** A click count between closed (left) and fully open (right). Accent colour: not a wear status. */
function ClickGauge({
  label,
  clicks,
  max,
}: {
  label: { name: string; short: string };
  clicks: number | null;
  max: number;
}) {
  const ratio = clicks == null ? 0 : Math.min(1, clicks / max);
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
        <span>
          {label.name} <span className="text-fg-muted">({label.short})</span>
        </span>
        <span className="text-fg-muted">
          <span className="num text-[15px] font-semibold text-fg">{clicks ?? "–"}</span> /{" "}
          {withUnit(formatInteger(max), max > 1 ? "clics" : "clic")}
        </span>
      </div>
      <div
        role="img"
        aria-label={
          clicks == null
            ? `${label.short} : pas noté, ${max} clics en tout`
            : `${label.short} : ${clicks} clic${clicks > 1 ? "s" : ""} depuis fermé, sur ${max}`
        }
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <span className="block h-full rounded-full bg-brand" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function TiresPanel({
  current,
  onChange,
}: {
  current: SetupEntryVM | null;
  onChange?: () => void;
}) {
  const front = current?.values.tireFrontPressureBar ?? null;
  const rear = current?.values.tireRearPressureBar ?? null;
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-border">
        <Stat label="Pneu avant" value={front != null ? formatBar(front) : null} />
        <Stat label="Pneu arrière" value={rear != null ? formatBar(rear) : null} />
      </div>
      {onChange ? (
        <div className="border-t border-border px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onChange}
            aria-label="Changer la pression des pneus"
          >
            <SlidersHorizontal />
            {front == null && rear == null ? "Noter les pressions" : "Changer les pressions"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** Short advice: "symptom → what to do", one topic per row (D-83). */
function AdvicePanel({ unit }: { unit: SuspensionUnitVM }) {
  const rows = adviceFor(
    unit.typeCode,
    unit.specs?.springType ?? null,
    unit.specs ? adjustersOf(unit.specs).map((a) => a.code) : null,
  );
  const used = [...new Set(rows.flatMap((row) => row.sources))] as AdviceSourceId[];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 pt-3.5 pb-2">
        <h3 className="text-[15px] font-semibold">Conseils</h3>
        <span className="text-[12.5px] text-fg-muted">Fermer = sens horaire = plus freiné</span>
      </div>
      <dl className="m-0 divide-y divide-border border-y border-border">
        {rows.map((row) => (
          <div
            key={`${row.topic}-${row.lines[0].when}`}
            className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-3 px-4 py-2.5"
          >
            <dt className="text-[13.5px] font-semibold">{row.topic}</dt>
            <dd className="m-0 grid gap-1 text-[13.5px] leading-snug">
              {row.lines.map((line) => (
                <span key={line.when}>
                  {line.when}
                  {line.then ? (
                    <>
                      {" "}
                      <span className="whitespace-nowrap">
                        <span aria-hidden className="text-fg-muted">
                          →
                        </span>
                        <span className="sr-only">:</span>{" "}
                        <span className="font-semibold text-brand-ink">{line.then}</span>
                      </span>
                    </>
                  ) : null}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <details className="group px-4 py-2.5 text-[12.5px] text-fg-muted">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          D&apos;après les guides FOX, lus le {formatDate(ADVICE_SOURCES.fox_40_2019.verifiedOn)}.
          Le guide de ton modèle prime. <span className="text-brand-ink underline">Sources</span>
        </summary>
        <ul className="m-0 mt-1.5 grid list-none gap-1 p-0">
          {used.map((id) => (
            <li key={id}>
              <a
                href={ADVICE_SOURCES[id].url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-ink hover:underline"
              >
                {ADVICE_SOURCES[id].title}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

function HistoryEntry({
  entry,
  current,
  today,
  onEdit,
  onRestore,
}: {
  entry: SetupEntryVM;
  current: boolean;
  today: LocalDate;
  onEdit?: () => void;
  onRestore?: () => void;
}) {
  const groups = (["fork", "rear_shock", "tires"] as const)
    .map((unit) => ({ unit, changes: entry.changes.filter((c) => c.unit === unit) }))
    .filter((group) => group.changes.length);
  return (
    <li className="grid gap-1.5 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14.5px] font-semibold">
            {formatDate(entry.setOn, { year: "auto", today })}
          </span>
          {entry.label ? <span className="text-[14px]">« {entry.label} »</span> : null}
          {current ? <Badge>Actuel</Badge> : null}
        </div>
        {onEdit ? (
          <Button
            variant="ghost"
            size="icon"
            className="-my-1.5 -mr-2"
            aria-label={`Modifier le réglage du ${formatDate(entry.setOn)}`}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
        ) : null}
      </div>
      {groups.length ? (
        <ul className="m-0 grid list-none gap-0.5 p-0 text-[13.5px] leading-snug">
          {groups.map(({ unit, changes }) => (
            <li key={unit}>
              <span className="font-medium">{SETUP_UNIT_LABELS[unit]} :</span>{" "}
              <span className="text-fg-muted">
                {changes
                  .map((c) =>
                    c.from == null ? `${c.field} ${c.to}` : `${c.field} ${c.from} → ${c.to ?? "–"}`,
                  )
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13.5px] text-fg-muted">
          {entry.first ? "Aucune valeur notée." : "Mêmes valeurs que le réglage précédent."}
        </p>
      )}
      {entry.notes ? <p className="text-[13.5px] whitespace-pre-line">{entry.notes}</p> : null}
      {onRestore ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            aria-label={`Revenir au réglage du ${formatDate(entry.setOn)}`}
            onClick={onRestore}
          >
            <RotateCcw />
            Revenir à ce réglage
          </Button>
        </div>
      ) : null}
    </li>
  );
}
