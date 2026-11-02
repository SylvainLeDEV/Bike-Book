"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "cn";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  ListChecks,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { AttachmentsBlock } from "@/components/attachments/attachments-block";
import { DeleteConfirm } from "@/components/delete-confirm";
import { ResourceRow } from "@/components/procedures/procedure-detail";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, Input, Textarea } from "@/components/ui/field";
import { formatTorque } from "@/lib/display";
import { formatDate } from "@/lib/format";
import { procedureNeeds } from "@/lib/procedures";
import type { FinishRunInput, PartItemVM, ReplacePartInput, RunVM } from "@/lib/view-models";
import { RunSummary } from "./run-summary";

export type RunActions = {
  /** "Étape faite", a comment. Resolves with an error message, or null. */
  onStep: (
    stepId: number,
    patch: { done?: boolean; comment?: string | null },
  ) => Promise<string | null>;
  onAddStep: (instruction: string) => Promise<{ stepId: number } | { error: string }>;
  onRemoveStep: (stepId: number) => Promise<string | null>;
  /** "Abandonner le suivi", confirmed. */
  onAbandon: () => Promise<string | null>;
  onFinish: (input: FinishRunInput) => Promise<string | null>;
  /** "Remplacer une pièce" from the summary: the event it wrote, which the run then joins. */
  onReplace?: (
    input: ReplacePartInput,
    item: PartItemVM | null,
  ) => Promise<{ ok: true; eventId: number | null } | { ok: false; error: string }>;
};

type Place = number | "summary";

/**
 * A run ("suivi", D-82, D-87), full screen like the mockup's workshop mode: one step at a time in
 * large type, its torque and reference photos, "Étape faite", a comment and photos; the list of
 * steps to jump or add one; the procedure's links and material; then the summary.
 */
export function RunScreen({
  vm,
  actions,
  quitHref,
}: {
  vm: RunVM;
  actions: RunActions;
  /** Where "Quitter" leads: the run stays in progress. */
  quitHref: string;
}) {
  const done = vm.status === "done";
  const firstOpen = vm.steps.findIndex((step) => !step.done);
  const [place, setPlace] = React.useState<Place>(
    done ? 0 : vm.steps.length === 0 ? 0 : firstOpen < 0 ? "summary" : firstOpen,
  );
  const [panel, setPanel] = React.useState<"steps" | "resources" | null>(null);
  const [confirmAbandon, setConfirmAbandon] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [live, setLive] = React.useState("");
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const n = vm.steps.length;
  const doneCount = vm.steps.filter((step) => step.done).length;
  const index = typeof place === "number" ? Math.min(place, Math.max(0, n - 1)) : null;
  const step = index != null ? vm.steps[index] : null;

  function go(next: Place, { fromKeys = false } = {}) {
    setPlace(next);
    setPanel(null);
    const nextStep = typeof next === "number" ? vm.steps[next] : null;
    setLive(
      next === "summary"
        ? "Récapitulatif"
        : nextStep
          ? `Étape ${next + 1} sur ${n} : ${nextStep.instruction}`
          : "",
    );
    document.getElementById("run-body")?.scrollTo({ top: 0 });
    if (fromKeys) requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
  }

  // ← and → move between steps, unless the focus is in a field.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowRight" && typeof place === "number") {
        go(place + 1 >= n ? "summary" : place + 1, { fromKeys: true });
      } else if (event.key === "ArrowLeft") {
        if (place === "summary" && n) go(n - 1, { fromKeys: true });
        else if (typeof place === "number" && place > 0) go(place - 1, { fromKeys: true });
      }
    }
    if (done) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      role="region"
      aria-labelledby="run-title"
      className="fixed inset-0 z-[35] flex flex-col bg-bg pt-[env(safe-area-inset-top)]"
    >
      <header className="border-b border-border bg-surface px-4 py-2.5 md:px-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href={quitHref}>
              <ChevronLeft />
              Quitter
            </Link>
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p id="run-title" className="truncate text-[15px] font-semibold">
              {vm.title}
            </p>
            <p className="truncate text-[12.5px] text-fg-muted">
              {[vm.bike?.name ?? "Général", vm.context].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toutes les étapes"
            aria-expanded={panel === "steps"}
            onClick={() => setPanel((p) => (p === "steps" ? null : "steps"))}
          >
            <ListChecks />
          </Button>
          {vm.resources.length || vm.lines.length ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Ressources et matériel"
              aria-expanded={panel === "resources"}
              onClick={() => setPanel((p) => (p === "resources" ? null : "resources"))}
            >
              <BookOpen />
            </Button>
          ) : null}
        </div>
        {n ? (
          <div className="mx-auto mt-2 max-w-2xl">
            <div className="mb-1 flex justify-between text-[12.5px] text-fg-muted">
              <span>
                {done
                  ? `Terminé le ${vm.finishedOn ? formatDate(vm.finishedOn) : ""}`
                  : place === "summary"
                    ? "Récapitulatif"
                    : `Étape ${(index ?? 0) + 1} sur ${n}`}
              </span>
              <span>
                {doneCount} faite{doneCount > 1 ? "s" : ""} sur {n}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Étapes faites"
              aria-valuemin={0}
              aria-valuemax={n}
              aria-valuenow={doneCount}
              className="h-1.5 overflow-hidden rounded-full bg-track"
            >
              <span
                className="block h-full rounded-full bg-brand transition-[width] motion-reduce:transition-none"
                style={{ width: `${(doneCount / n) * 100}%` }}
              />
            </div>
          </div>
        ) : null}
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>

      <div id="run-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto grid max-w-2xl gap-5 px-4 py-5 md:px-6">
          {error ? <FieldError>{error}</FieldError> : null}
          {panel === "steps" ? (
            <StepList
              vm={vm}
              current={place}
              onGo={(i) => go(i)}
              onAdd={
                done
                  ? undefined
                  : async (instruction) => {
                      const result = await actions.onAddStep(instruction);
                      if ("error" in result) return result.error;
                      go(n);
                      return null;
                    }
              }
            />
          ) : panel === "resources" ? (
            <ResourcesPanel vm={vm} />
          ) : place === "summary" && vm.summary ? (
            <RunSummary
              vm={vm}
              summary={vm.summary}
              onReplace={actions.onReplace}
              onFinish={actions.onFinish}
            />
          ) : step && index != null ? (
            <StepView
              key={step.id}
              step={step}
              index={index}
              total={n}
              readOnly={done}
              titleRef={titleRef}
              actions={actions}
              onError={setError}
            />
          ) : (
            <EmptySteps
              onAdd={
                done
                  ? undefined
                  : async (instruction) => {
                      const result = await actions.onAddStep(instruction);
                      return "error" in result ? result.error : null;
                    }
              }
            />
          )}

          {done && vm.event && vm.bike ? (
            <Card padded className="text-sm">
              Enregistré dans l&apos;historique le {formatDate(vm.event.performedOn)}.{" "}
              <Button variant="link" asChild>
                <Link href={`/bikes/${vm.event.bikeId}?tab=history`}>Voir l&apos;historique</Link>
              </Button>
            </Card>
          ) : null}

          {done || panel ? null : confirmAbandon ? (
            <DeleteConfirm
              question="Abandonner ce suivi ? Ses étapes cochées, ses commentaires et ses photos seront supprimés ; rien n'est écrit dans l'historique."
              confirmLabel="Abandonner"
              pending={pending}
              onCancel={() => setConfirmAbandon(false)}
              onConfirm={async () => {
                setPending(true);
                const message = await actions
                  .onAbandon()
                  .catch(() => "Abandon impossible. Réessaie.");
                setPending(false);
                if (message) {
                  setError(message);
                  setConfirmAbandon(false);
                }
              }}
            />
          ) : (
            <div className="border-t border-border pt-3">
              <Button variant="ghost" size="sm" onClick={() => setConfirmAbandon(true)}>
                <Trash2 />
                Abandonner le suivi…
              </Button>
            </div>
          )}
        </div>
      </div>

      {done || panel || place === "summary" ? (
        place === "summary" && !panel && !done ? (
          // Its own key: reusing the step footer's button would turn the tap on "Récapitulatif"
          // into a submit of the summary while the tap is still being handled.
          <footer
            key="summary"
            className="border-t border-border bg-surface px-4 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] md:px-6"
          >
            <div className="mx-auto flex max-w-2xl gap-2">
              <Button
                variant="secondary"
                size="lg"
                disabled={!n}
                onClick={() => go(Math.max(0, n - 1))}
              >
                <ChevronLeft />
                Étapes
              </Button>
              <Button type="submit" form="run-summary" size="lg" className="flex-1">
                <Check />
                {vm.summary?.writesEvent ? "Enregistrer l'entretien" : "Marquer la tâche faite"}
              </Button>
            </div>
          </footer>
        ) : null
      ) : (
        <footer
          key="steps"
          className="border-t border-border bg-surface px-4 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] md:px-6"
        >
          <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="lg"
              disabled={index == null || index === 0}
              onClick={() => index != null && go(index - 1)}
            >
              <ChevronLeft />
              Précédente
            </Button>
            <Button
              size="lg"
              onClick={() => go(index == null || index + 1 >= n ? "summary" : index + 1)}
            >
              {index == null || index + 1 >= n ? "Récapitulatif" : "Suivante"}
              <ChevronRight />
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function StepView({
  step,
  index,
  total,
  readOnly,
  titleRef,
  actions,
  onError,
}: {
  step: RunVM["steps"][number];
  index: number;
  total: number;
  readOnly: boolean;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  actions: RunActions;
  onError: (message: string | null) => void;
}) {
  const [done, setDone] = React.useState(step.done);
  const [comment, setComment] = React.useState(step.comment ?? "");
  const [saved, setSaved] = React.useState(step.comment ?? "");
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const owner = React.useMemo(
    () => ({ kind: "procedure_run_step" as const, id: step.id }),
    [step.id],
  );

  async function saveComment() {
    if (comment.trim() === saved.trim()) return;
    const error = await actions.onStep(step.id, { comment: comment.trim() || null });
    onError(error);
    if (!error) setSaved(comment);
  }

  return (
    <article className="grid gap-4">
      <div>
        <p className="eyebrow">
          Étape {index + 1} sur {total}
        </p>
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="mt-1 text-[22px] leading-snug font-[650] tracking-[-0.01em] whitespace-pre-line outline-none md:text-[26px]"
        >
          {step.instruction}
        </h2>
        {step.note ? (
          <p className="mt-2 text-[15px] whitespace-pre-line text-fg-muted">{step.note}</p>
        ) : null}
      </div>
      {step.torqueNm != null ? (
        <p className="inline-flex w-fit items-center gap-2 rounded-card bg-brand-soft px-3.5 py-2.5 text-brand-ink [&_svg]:size-5">
          <Gauge aria-hidden />
          <span className="text-sm font-medium">Couple de serrage</span>
          <b className="num text-[28px] leading-none">{formatTorque(step.torqueNm)}</b>
        </p>
      ) : null}
      {step.reference.length ? (
        <div>
          <p className="mb-1.5 text-[13.5px] font-semibold">Photos de référence</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {step.reference.map((photo) => (
              <li key={photo.url}>
                <a
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block size-24 overflow-hidden rounded-[10px] bg-surface-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler */}
                  <img src={photo.thumbUrl} alt={photo.alt} className="size-full object-cover" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <label
        className={cn(
          "flex min-h-14 cursor-pointer items-center gap-3 rounded-card border-2 px-4 text-[17px] font-semibold transition-colors",
          done ? "border-brand bg-brand-soft text-brand-ink" : "border-border bg-surface",
          readOnly && "cursor-default",
        )}
      >
        <input
          type="checkbox"
          className="size-6 accent-[var(--brand)]"
          checked={done}
          disabled={readOnly}
          onChange={async (e) => {
            const next = e.target.checked;
            setDone(next);
            const error = await actions.onStep(step.id, { done: next });
            onError(error);
            if (error) setDone(!next);
          }}
        />
        Étape faite
      </label>

      <Field label="Commentaire" hint={readOnly ? undefined : "Enregistré en quittant le champ."}>
        <Textarea
          value={comment}
          readOnly={readOnly}
          placeholder="Ce que tu as constaté, ce qui a coincé…"
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => void saveComment()}
        />
      </Field>

      <Card padded>
        <AttachmentsBlock owner={owner} title="Photos de l'étape" />
      </Card>

      {step.added && !readOnly ? (
        confirmRemove ? (
          <DeleteConfirm
            question={
              step.photoCount
                ? `Retirer cette étape ? Ses ${step.photoCount} photo${step.photoCount > 1 ? "s" : ""} seront supprimées.`
                : "Retirer cette étape ?"
            }
            confirmLabel="Retirer l'étape"
            pending={false}
            onCancel={() => setConfirmRemove(false)}
            onConfirm={async () => onError(await actions.onRemoveStep(step.id))}
          />
        ) : (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
              <X />
              Retirer cette étape
            </Button>
          </div>
        )
      ) : null}
    </article>
  );
}

function AddStep({ onAdd }: { onAdd: (instruction: string) => Promise<string | null> }) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  return (
    <form
      className="grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return setError("Écris ce qu'il faut faire.");
        setPending(true);
        const message = await onAdd(text.trim()).catch(() => "Ajout impossible. Réessaie.");
        setPending(false);
        setError(message);
        if (!message) setText("");
      }}
    >
      <Field label="Nouvelle étape" error={error}>
        <Input
          autoComplete="off"
          placeholder="Ex. Vérifier le serrage des vis d'étrier"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
      </Field>
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <Plus />
          Ajouter l&apos;étape
        </Button>
      </div>
    </form>
  );
}

function EmptySteps({ onAdd }: { onAdd?: (instruction: string) => Promise<string | null> }) {
  return (
    <Card padded className="grid gap-3">
      <p className="flex items-center gap-2 text-[15px] font-semibold [&_svg]:size-5 [&_svg]:text-fg-muted">
        <ClipboardCheck aria-hidden />
        Pas encore d&apos;étape
      </p>
      <p className="hint">
        Ajoute les étapes au fil de l&apos;eau : chacune peut recevoir un commentaire et des photos.
        Le récapitulatif se trouve après la dernière.
      </p>
      {onAdd ? <AddStep onAdd={onAdd} /> : null}
    </Card>
  );
}

function StepList({
  vm,
  current,
  onGo,
  onAdd,
}: {
  vm: RunVM;
  current: Place;
  onGo: (index: Place) => void;
  onAdd?: (instruction: string) => Promise<string | null>;
}) {
  return (
    <section aria-labelledby="run-steps-title" className="grid gap-3">
      <h2 id="run-steps-title" className="text-[17px] font-semibold">
        Toutes les étapes
      </h2>
      {vm.steps.length ? (
        <Card asChild className="overflow-hidden">
          <ol className="m-0 list-none divide-y divide-border p-0">
            {vm.steps.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  aria-current={current === index ? "step" : undefined}
                  onClick={() => onGo(index)}
                  className="grid w-full grid-cols-[28px_minmax(0,1fr)] items-start gap-3 px-4 py-3 text-left hover:bg-[color-mix(in_oklch,var(--surface-2),var(--surface)_40%)] aria-[current=step]:bg-brand-soft"
                >
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-full num text-[14px] font-semibold",
                      step.done ? "bg-brand text-brand-fg" : "bg-surface-2",
                    )}
                  >
                    {step.done ? <Check className="size-4" aria-hidden /> : index + 1}
                  </span>
                  <span className="min-w-0 text-[14.5px]">
                    {step.instruction}
                    <span className="sr-only">{step.done ? " (faite)" : " (à faire)"}</span>
                    {step.comment || step.photoCount ? (
                      <span className="block text-[12.5px] text-fg-muted">
                        {[
                          step.comment ? "commentaire" : null,
                          step.photoCount
                            ? `${step.photoCount} photo${step.photoCount > 1 ? "s" : ""}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <p className="hint">Pas encore d&apos;étape.</p>
      )}
      {onAdd ? <AddStep onAdd={onAdd} /> : null}
      {vm.summary ? (
        <div>
          <Button variant="secondary" size="sm" onClick={() => onGo("summary")}>
            Aller au récapitulatif
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ResourcesPanel({ vm }: { vm: RunVM }) {
  const needs = procedureNeeds(vm.lines, vm.items, vm.bike?.id ?? null);
  return (
    <section aria-labelledby="run-resources-title" className="grid gap-3">
      <h2 id="run-resources-title" className="text-[17px] font-semibold">
        Ressources et matériel
      </h2>
      {vm.resources.length ? (
        <Card asChild className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-border p-0">
            {vm.resources.map((resource) => (
              <ResourceRow key={resource.id} resource={resource} />
            ))}
          </ul>
        </Card>
      ) : null}
      {needs.length ? (
        <Card asChild className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-border p-0">
            {needs.map((need) => (
              <li key={need.lineId} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 text-[14.5px] font-semibold">{need.name}</span>
                <span className="shrink-0 text-[13px] text-fg-muted">{need.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
