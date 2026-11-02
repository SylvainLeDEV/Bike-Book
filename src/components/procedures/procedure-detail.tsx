"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "cn";
import {
  Archive,
  ArchiveRestore,
  CircleCheck,
  CirclePlay,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ExternalLink,
  Gauge,
  Globe,
  ListOrdered,
  PackageMinus,
  PackageX,
  Pencil,
  Play,
  Plus,
  ShoppingCart,
  StickyNote,
} from "lucide-react";
import { AttachmentsBlock } from "@/components/attachments/attachments-block";
import { BikeCover } from "@/components/bike-cover";
import { KIND_ICONS } from "@/components/icons";
import { RebuyBadge, RuleStatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Fieldset } from "@/components/ui/field";
import { BikesMeta } from "@/components/workshop/inventory-row";
import { formatStock, formatTorque } from "@/lib/display";
import { formatDuration } from "@/lib/format";
import { INVENTORY_KIND_LABELS, PROCEDURE_DIFFICULTY_LABELS } from "@/lib/labels";
import {
  procedureNeeds,
  readinessOf,
  type NeedAvailability,
  type ProcedureNeed,
} from "@/lib/procedures";
import type {
  BikeRef,
  InventoryItemVM,
  ProcedureDifficulty,
  ProcedureResourceVM,
  ProcedureVM,
} from "@/lib/view-models";

export type ProcedureActions = {
  onEdit?: (procedure: ProcedureVM) => void;
  /** "Archiver la fiche" (true) or "Désarchiver" (false), with "Annuler". */
  onArchive?: (procedure: ProcedureVM, archived: boolean) => void;
  /** "Ajouter aux achats": the workshop item goes to "À commander". */
  onOrder?: (item: InventoryItemVM) => void;
  /** "Ajouter à l'atelier" from a line not in the workshop: the add sheet, prefilled. */
  onAddLineItem?: (lineId: number, prefill: NonNullable<ProcedureNeed["prefill"]>) => void;
  /** Opens a workshop item (its own tab). */
  onOpenItem?: (itemId: number) => void;
  /** "Commencer" for the bike chosen (D-87): a run of this procedure, or the one in progress. */
  onStart?: (procedure: ProcedureVM, bikeId: number) => void | Promise<void>;
};

const DIFFICULTY_BARS: Record<ProcedureDifficulty, number> = { easy: 1, medium: 2, hard: 3 };

function DifficultyGauge({ difficulty }: { difficulty: ProcedureDifficulty }) {
  return (
    <span aria-hidden className="inline-flex h-4 items-center gap-[3px]">
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn(
            "h-3 w-2 rounded-[3px]",
            bar <= DIFFICULTY_BARS[difficulty]
              ? "bg-brand"
              : "shadow-[inset_0_0_0_1.5px_color-mix(in_oklch,var(--fg-muted),transparent_45%)]",
          )}
        />
      ))}
    </span>
  );
}

function Section({
  id,
  title,
  side,
  children,
}: {
  id: string;
  title: string;
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 id={id} className="text-[17px] leading-[1.3] font-semibold tracking-[-0.01em]">
          {title}
        </h3>
        {side}
      </div>
      {children}
    </section>
  );
}

const AVAILABILITY_ICONS: Record<NeedAvailability, typeof CircleCheck> = {
  ok: CircleCheck,
  low: PackageMinus,
  missing: PackageX,
};

const GROUPS: { group: ProcedureNeed["group"]; label: string }[] = [
  { group: "tool", label: "Outils" },
  { group: "part", label: "Pièces d'usure" },
  { group: "product", label: "Produits" },
  { group: "other", label: "À ajouter à l'atelier" },
];

function urlHost(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function NeedRow({ need, actions }: { need: ProcedureNeed; actions: ProcedureActions }) {
  const Icon = need.group === "other" ? Plus : KIND_ICONS[need.group];
  const Availability = AVAILABILITY_ICONS[need.availability];
  const item = need.item;
  const perJob =
    item?.kind === "part" && need.quantity
      ? `${formatStock(need.quantity, item.unit)} par entretien`
      : need.quantity && !item
        ? `${need.quantity} par entretien`
        : null;
  const meta = [
    need.group === "other" ? null : INVENTORY_KIND_LABELS[need.group],
    perJob,
    item?.location ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
  const restocking = item?.state === "to_order" || item?.state === "ordered" ? item.state : null;
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 py-3">
      <span className="row-span-2 grid size-9 place-items-center rounded-[10px] bg-surface-2 text-fg-muted [&_svg]:size-[18px]">
        <Icon aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[14.5px] font-semibold">
          {item && actions.onOpenItem ? (
            <Button
              variant="link"
              className="text-left text-[14.5px] font-semibold"
              onClick={() => actions.onOpenItem?.(item.id)}
            >
              {need.name}
            </Button>
          ) : (
            need.name
          )}
        </p>
        {meta ? <p className="text-[13px] text-fg-muted">{meta}</p> : null}
      </div>
      <div className="col-start-2 flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[13px] font-medium [&_svg]:size-4",
            need.availability === "ok" ? "text-fg-muted" : "text-fg",
          )}
        >
          <Availability aria-hidden />
          {need.text}
        </span>
        {restocking ? (
          <RebuyBadge state={restocking} />
        ) : need.action === "order" && item && actions.onOrder ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Ajouter ${need.name} aux achats`}
            onClick={() => actions.onOrder?.(item)}
          >
            <ShoppingCart />
            Ajouter aux achats
          </Button>
        ) : need.action === "add" && need.prefill && actions.onAddLineItem ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Ajouter ${need.name} à l'atelier`}
            onClick={() => actions.onAddLineItem?.(need.lineId, need.prefill!)}
          >
            <Plus />
            Ajouter à l&apos;atelier
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function ResourceRow({ resource }: { resource: ProcedureResourceVM }) {
  if (resource.kind === "note") {
    return (
      <li className="flex items-start gap-3 px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-muted [&_svg]:size-[18px]">
          <StickyNote aria-hidden />
        </span>
        <div className="min-w-0">
          {resource.title ? <p className="text-[14.5px] font-semibold">{resource.title}</p> : null}
          <p className="text-sm leading-relaxed whitespace-pre-line">{resource.body}</p>
        </div>
      </li>
    );
  }
  const video = resource.kind === "video";
  const host = urlHost(resource.url);
  const meta = [
    video ? "Vidéo" : "Lien",
    host,
    video && resource.durationS ? formatDuration(resource.durationS) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      {/* A link card: opened on its own site, never embedded, nothing loaded from it (D-09). */}
      <a
        href={resource.url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[color-mix(in_oklch,var(--surface-2),var(--surface)_40%)] focus-visible:-outline-offset-3"
      >
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-muted [&_svg]:size-[18px]",
            video ? "h-9 w-14" : "size-9",
          )}
        >
          {video ? <CirclePlay aria-hidden /> : <Globe aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold">{resource.title || host}</span>
          <span className="block text-[13px] text-fg-muted">{meta}</span>
        </span>
        <ExternalLink className="size-[18px] shrink-0 text-fg-muted" aria-hidden />
        <span className="sr-only">(nouvel onglet)</span>
      </a>
    </li>
  );
}

/**
 * A procedure ("fiche", D-47, D-86): what it is about, the bike it is prepared for, its material
 * read against the workshop for that bike, its ordered steps with their photos, its links and
 * documents, and the rules and tasks that use it.
 */
export function ProcedureDetail({
  procedure,
  items,
  bikes,
  initialBikeId,
  actions,
}: {
  procedure: ProcedureVM;
  items: InventoryItemVM[];
  /** Every ridable bike: "Tous les vélos" means them. */
  bikes: BikeRef[];
  /** The bike chosen by the context (bike filter, bike page), when the procedure serves it. */
  initialBikeId: number | null;
  actions: ProcedureActions;
}) {
  const served = procedure.bikes === "all" ? bikes : procedure.bikes;
  const [bikeId, setBikeId] = React.useState<number | null>(
    served.some((bike) => bike.id === initialBikeId) ? initialBikeId : (served[0]?.id ?? null),
  );
  const bike = served.find((b) => b.id === bikeId) ?? null;
  const running = procedure.runs?.find((run) => run.bikeId === bikeId) ?? null;
  const needs = procedureNeeds(procedure.lines, items, bikeId);
  const readiness = readinessOf(needs);
  const missing = needs.filter((need) => need.availability === "missing");
  const docsOwner = React.useMemo(
    () => ({ kind: "procedure" as const, id: procedure.id }),
    [procedure.id],
  );
  const context = [procedure.typeLabel ?? "Général", procedure.modelHint]
    .filter(Boolean)
    .join(" · ");

  return (
    <article aria-labelledby="procedure-title" className="grid content-start gap-[22px]">
      <header className="grid grid-cols-[48px_minmax(0,1fr)] items-start gap-3.5">
        <span className="grid size-12 place-items-center rounded-card bg-brand-soft text-brand-ink [&_svg]:size-[22px]">
          <ListOrdered aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="eyebrow">Fiche d&apos;entretien · {context}</p>
          <h2
            id="procedure-title"
            tabIndex={-1}
            className="mt-0.5 text-[22px] leading-tight font-[650] tracking-[-0.015em] text-balance outline-none"
          >
            {procedure.title}
          </h2>
          {procedure.description ? (
            <p className="mt-1 text-sm whitespace-pre-line text-fg-muted">
              {procedure.description}
            </p>
          ) : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-fg-muted [&_svg]:size-3.5">
            {procedure.estimatedDurationS ? (
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden />≈ {formatDuration(procedure.estimatedDurationS)}
              </span>
            ) : null}
            {procedure.difficulty ? (
              <span className="inline-flex items-center gap-1.5">
                <DifficultyGauge difficulty={procedure.difficulty} />
                Difficulté : {PROCEDURE_DIFFICULTY_LABELS[procedure.difficulty].toLowerCase()}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <ListOrdered aria-hidden />
              {procedure.steps.length} étape{procedure.steps.length > 1 ? "s" : ""}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <BikesMeta bikes={procedure.bikes} all={bikes} />
            </span>
          </p>
          {procedure.archived ? (
            <p className="mt-2">
              <Badge variant="outline">
                <Archive aria-hidden />
                Archivée
              </Badge>
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {running ? (
          <Button size="sm" asChild>
            <Link href={`/runs/${running.id}`}>
              <ClipboardCheck />
              Reprendre{bike && served.length > 1 ? ` · ${bike.name}` : ""}
            </Link>
          </Button>
        ) : bikeId != null && actions.onStart && !procedure.archived ? (
          <Button size="sm" onClick={() => void actions.onStart?.(procedure, bikeId)}>
            <Play />
            Commencer{bike && served.length > 1 ? ` · ${bike.name}` : ""}
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={() => actions.onEdit?.(procedure)}>
          <Pencil />
          Modifier
        </Button>
        {procedure.archived ? (
          <Button variant="ghost" size="sm" onClick={() => actions.onArchive?.(procedure, false)}>
            <ArchiveRestore />
            Désarchiver
          </Button>
        ) : null}
      </div>

      {served.length > 1 ? (
        <Fieldset legend="Préparer pour" hint="le matériel est lu pour ce vélo">
          <ChipRow>
            {served.map((b) => (
              <Chip
                key={b.id}
                name={`procedure-${procedure.id}-bike`}
                value={b.id}
                checked={b.id === bikeId}
                onChange={() => setBikeId(b.id)}
              >
                <BikeCover as="span" cover={b.cover} bare className="-ml-2 size-7 rounded-full" />
                {b.name}
              </Chip>
            ))}
          </ChipRow>
        </Fieldset>
      ) : null}

      {readiness ? (
        <Card
          padded
          role="note"
          className="flex items-start gap-2.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-[18px] [&>svg]:shrink-0"
        >
          {missing.length ? (
            <>
              <PackageX aria-hidden />
              <p>
                <b>
                  Il manque {missing.length} élément{missing.length > 1 ? "s" : ""}
                  {bike ? ` pour ${bike.name}` : ""}
                </b>{" "}
                : {missing.map((need) => need.name).join(", ")}.
              </p>
            </>
          ) : (
            <>
              <CircleCheck aria-hidden />
              <p>
                {readiness.low
                  ? `Tout est dans l'atelier${bike ? ` pour ${bike.name}` : ""}, mais ${readiness.low} élément${readiness.low > 1 ? "s sont" : " est"} en stock bas.`
                  : `Tout le matériel est dans l'atelier${bike ? ` pour ${bike.name}` : ""}.`}
              </p>
            </>
          )}
        </Card>
      ) : null}

      <Section id="procedure-links" title="Règles et tâches liées">
        {procedure.links.length ? (
          <Card asChild className="overflow-hidden">
            <ul className="m-0 list-none divide-y divide-border p-0">
              {procedure.links.map((link) => (
                <li
                  key={`${link.kind}-${link.id}`}
                  className="flex min-h-[60px] items-center gap-3 px-4 py-2.5"
                >
                  {link.bike ? (
                    <BikeCover
                      cover={link.bike.cover}
                      bare
                      className="size-9 shrink-0 rounded-[10px]"
                    />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-muted [&_svg]:size-[18px]">
                      <ClipboardList aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold">{link.title}</p>
                    <p className="text-[13px] text-fg-muted">
                      {link.bike?.name ?? "Général"} · {link.kind === "rule" ? "Règle" : "Tâche"}
                    </p>
                  </div>
                  {link.status ? (
                    <RuleStatusBadge status={link.status} />
                  ) : (
                    <Badge>
                      <ClipboardList aria-hidden />
                      Tâche
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="hint">
            Aucune règle ni tâche ne pointe vers cette fiche. Relie-la depuis la feuille « Règles »
            d&apos;un vélo, ou depuis une tâche.
          </p>
        )}
      </Section>

      <Section
        id="procedure-material"
        title="Matériel"
        side={<span className="hint">depuis l&apos;atelier</span>}
      >
        {needs.length ? (
          <Card className="overflow-hidden">
            {GROUPS.map(({ group, label }) => {
              const rows = needs.filter((need) => need.group === group);
              return rows.length ? (
                <div key={group} className="border-b border-border last:border-b-0">
                  <p className="px-4 pt-3 pb-0.5 eyebrow">{label}</p>
                  <ul className="m-0 list-none divide-y divide-border p-0">
                    {rows.map((need) => (
                      <NeedRow key={need.lineId} need={need} actions={actions} />
                    ))}
                  </ul>
                </div>
              ) : null;
            })}
          </Card>
        ) : (
          <p className="hint">Aucun matériel noté.</p>
        )}
      </Section>

      <Section id="procedure-steps" title="Étapes">
        {procedure.steps.length ? (
          <Card asChild className="overflow-hidden">
            <ol className="m-0 list-none divide-y divide-border p-0">
              {procedure.steps.map((step, index) => (
                <li
                  key={step.id}
                  className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 px-4 py-3.5"
                >
                  <span
                    aria-hidden
                    className="grid size-7 place-items-center rounded-full bg-surface-2 num text-[15px] font-semibold"
                  >
                    {index + 1}
                  </span>
                  <div className="grid min-w-0 gap-2">
                    <p className="text-[14.5px] leading-relaxed whitespace-pre-line">
                      <span className="sr-only">Étape {index + 1} : </span>
                      {step.instruction}
                    </p>
                    {step.note ? (
                      <p className="text-[13px] whitespace-pre-line text-fg-muted">{step.note}</p>
                    ) : null}
                    {step.torqueNm != null ? (
                      <p className="inline-flex w-fit items-center gap-1.5 rounded-control bg-brand-soft px-2.5 py-1 text-brand-ink [&_svg]:size-4">
                        <Gauge aria-hidden />
                        <span className="text-[13px] font-medium">Couple de serrage</span>
                        <b className="num text-base leading-none">{formatTorque(step.torqueNm)}</b>
                      </p>
                    ) : null}
                    <StepPhotos stepId={step.id} number={index + 1} />
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        ) : (
          <p className="hint">Aucune étape pour l&apos;instant : « Modifier » pour en ajouter.</p>
        )}
      </Section>

      {procedure.resources.length ? (
        <Section id="procedure-resources" title="Ressources">
          <Card asChild className="overflow-hidden">
            <ul className="m-0 list-none divide-y divide-border p-0">
              {procedure.resources.map((resource) => (
                <ResourceRow key={resource.id} resource={resource} />
              ))}
            </ul>
          </Card>
          {procedure.resources.some((r) => r.kind === "video") ? (
            <p className="mt-2 hint">
              Les vidéos s&apos;ouvrent sur leur site : aucun lecteur intégré, rien n&apos;est
              chargé depuis YouTube ici.
            </p>
          ) : null}
        </Section>
      ) : null}

      <Card padded>
        <AttachmentsBlock key={procedure.id} owner={docsOwner} title="Notices et documents" />
      </Card>

      {procedure.archived ? null : (
        <div>
          <Button variant="ghost" size="sm" onClick={() => actions.onArchive?.(procedure, true)}>
            <Archive />
            Archiver la fiche
          </Button>
        </div>
      )}
    </article>
  );
}

/** A step's reference photos (D-86): attachments of the step, added once the step exists. */
function StepPhotos({ stepId, number }: { stepId: number; number: number }) {
  const owner = React.useMemo(() => ({ kind: "procedure_step" as const, id: stepId }), [stepId]);
  return <AttachmentsBlock owner={owner} title={`Photos de l'étape ${number}`} />;
}
