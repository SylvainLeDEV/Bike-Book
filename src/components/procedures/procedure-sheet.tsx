"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Bike, Check, Plus, Trash2, X } from "lucide-react";
import { AttachmentsLater } from "@/components/attachments/attachments-block";
import { BikeCover } from "@/components/bike-cover";
import { DeleteConfirm } from "@/components/delete-confirm";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, FieldError, Fieldset, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { PROCEDURE_DIFFICULTIES, PROCEDURE_RESOURCE_KINDS } from "@/lib/enums";
import { PROCEDURE_DIFFICULTY_LABELS, PROCEDURE_RESOURCE_KIND_LABELS } from "@/lib/labels";
import { decimalText, parseDecimalInput } from "@/lib/parse";
import type {
  BikeRef,
  ComponentTypeOption,
  InventoryItemVM,
  ProcedureDifficulty,
  ProcedureInput,
  ProcedureResourceKind,
  ProcedureVM,
} from "@/lib/view-models";

/*
 * "Nouvelle fiche" and "Modifier la fiche" (D-47, D-86): one sheet, the header first, then the
 * steps (moved with ↑ ↓, a step with photos asks before it goes), the material from the workshop
 * and the links. Photos and documents are attached on the procedure once it exists (D-74).
 */

let nextKey = 0;
const key = () => `k${(nextKey += 1)}`;

type StepDraft = {
  key: string;
  id: number | null;
  instruction: string;
  note: string;
  torque: string;
  photoCount: number;
};

/** "item:12", "type:brake_pads", or "label" (typed by hand). */
type LineDraft = { key: string; choice: string; label: string; quantity: string };

type ResourceDraft = {
  key: string;
  kind: ProcedureResourceKind;
  url: string;
  title: string;
  minutes: string;
  body: string;
};

const toCount = (text: string) => {
  if (!text.trim()) return null;
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? n : Number.NaN;
};

function draftsOf(procedure: ProcedureVM | null) {
  return {
    steps: (procedure?.steps ?? []).map((step): StepDraft => ({
      key: key(),
      id: step.id,
      instruction: step.instruction,
      note: step.note ?? "",
      torque: step.torqueNm == null ? "" : decimalText(step.torqueNm, 2),
      photoCount: step.photoCount,
    })),
    lines: (procedure?.lines ?? []).map((line): LineDraft => ({
      key: key(),
      choice:
        line.target === "item"
          ? `item:${line.itemId}`
          : line.target === "type"
            ? `type:${line.componentTypeCode}`
            : "label",
      label: line.target === "label" ? line.label : "",
      quantity: line.quantity == null ? "" : String(line.quantity),
    })),
    resources: (procedure?.resources ?? []).map((resource): ResourceDraft => ({
      key: key(),
      kind: resource.kind,
      url: resource.url ?? "",
      title: resource.title ?? "",
      minutes: resource.durationS ? String(Math.round(resource.durationS / 60)) : "",
      body: resource.body ?? "",
    })),
  };
}

export function ProcedureSheet({
  open,
  onOpenChange,
  editing,
  initialBikeId,
  bikes,
  componentTypes,
  items,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Modifier la fiche": its current content. */
  editing: ProcedureVM | null;
  /** "Nouvelle fiche pour ce vélo": that bike ticked. */
  initialBikeId?: number | null;
  bikes: BikeRef[];
  componentTypes: ComponentTypeOption[];
  /** The workshop, for the material. */
  items: InventoryItemVM[];
  /** Resolves with an error message, or null once saved. */
  onSubmit: (input: ProcedureInput) => Promise<string | null>;
  /** "Supprimer la fiche", confirmed in the footer (D-70); resolves like `onSubmit`. */
  onDelete?: (procedure: ProcedureVM) => Promise<string | null>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={editing ? "Modifier la fiche" : "Nouvelle fiche"}
        description={
          editing
            ? editing.title
            : "Un mode opératoire réutilisable : étapes, matériel de l'atelier, liens."
        }
      >
        {open ? (
          <ProcedureForm
            editing={editing}
            initialBikeId={initialBikeId ?? null}
            bikes={bikes}
            componentTypes={componentTypes}
            items={items}
            onSubmit={async (input) => {
              const error = await onSubmit(input);
              if (!error) onOpenChange(false);
              return error;
            }}
            onDelete={
              editing && onDelete
                ? async () => {
                    const error = await onDelete(editing);
                    if (!error) onOpenChange(false);
                    return error;
                  }
                : undefined
            }
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ProcedureForm({
  editing,
  initialBikeId,
  bikes,
  componentTypes,
  items,
  onSubmit,
  onDelete,
}: {
  editing: ProcedureVM | null;
  initialBikeId: number | null;
  bikes: BikeRef[];
  componentTypes: ComponentTypeOption[];
  items: InventoryItemVM[];
  onSubmit: (input: ProcedureInput) => Promise<string | null>;
  onDelete?: () => Promise<string | null>;
}) {
  const [title, setTitle] = React.useState(editing?.title ?? "");
  const [description, setDescription] = React.useState(editing?.description ?? "");
  const [selectedBikes, setSelectedBikes] = React.useState<"all" | number[]>(
    editing
      ? editing.bikes === "all"
        ? "all"
        : editing.bikes.map((bike) => bike.id)
      : initialBikeId != null
        ? [initialBikeId]
        : [],
  );
  const [typeCode, setTypeCode] = React.useState(editing?.componentTypeCode ?? "");
  const [modelHint, setModelHint] = React.useState(editing?.modelHint ?? "");
  const [minutes, setMinutes] = React.useState(
    editing?.estimatedDurationS ? String(Math.round(editing.estimatedDurationS / 60)) : "",
  );
  const [difficulty, setDifficulty] = React.useState<ProcedureDifficulty | null>(
    editing?.difficulty ?? null,
  );
  const initial = React.useMemo(() => draftsOf(editing), [editing]);
  const [steps, setSteps] = React.useState<StepDraft[]>(initial.steps);
  const [lines, setLines] = React.useState<LineDraft[]>(initial.lines);
  const [resources, setResources] = React.useState<ResourceDraft[]>(initial.resources);
  const [confirmStep, setConfirmStep] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [titleError, setTitleError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLOListElement>(null);

  function toggleBike(id: number | "all", checked: boolean) {
    if (id === "all") return setSelectedBikes(checked ? "all" : []);
    setSelectedBikes((current) => {
      const list = current === "all" ? [] : current;
      return checked ? [...list, id] : list.filter((b) => b !== id);
    });
  }

  const patchStep = (k: string, patch: Partial<StepDraft>) =>
    setSteps((list) => list.map((s) => (s.key === k ? { ...s, ...patch } : s)));
  const patchLine = (k: string, patch: Partial<LineDraft>) =>
    setLines((list) => list.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const patchResource = (k: string, patch: Partial<ResourceDraft>) =>
    setResources((list) => list.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  /** Moves a step and keeps the focus on the button pressed, now in its new place. */
  function moveStep(k: string, by: -1 | 1) {
    const from = steps.findIndex((s) => s.key === k);
    const to = from + by;
    if (from < 0 || to < 0 || to >= steps.length) return;
    const next = [...steps];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSteps(next);
    setAnnounce(`Étape déplacée en position ${to + 1} sur ${next.length}.`);
    // The same button, unless the step reached an end and it is now disabled.
    const atEnd = to === 0 || to === next.length - 1;
    const move = by < 0 !== atEnd ? "up" : "down";
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-step="${k}"][data-move="${move}"]`)
        ?.focus(),
    );
  }

  function removeStep(k: string) {
    setSteps((list) => list.filter((s) => s.key !== k));
    setConfirmStep(null);
    setAnnounce("Étape retirée.");
  }

  function addStep() {
    const k = key();
    setSteps((list) => [
      ...list,
      { key: k, id: null, instruction: "", note: "", torque: "", photoCount: 0 },
    ]);
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLTextAreaElement>(`[data-step-text="${k}"]`)?.focus(),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError("Donne un titre à la fiche.");
      titleRef.current?.focus();
      return;
    }
    const duration = toCount(minutes);
    const input: ProcedureInput = {
      title: title.trim(),
      description: description.trim() || null,
      componentTypeCode: typeCode || null,
      modelHint: modelHint.trim() || null,
      bikes: selectedBikes,
      durationMin: duration,
      difficulty,
      steps: steps.map((s) => ({
        id: s.id,
        instruction: s.instruction.trim(),
        note: s.note.trim() || null,
        torqueNm: parseDecimalInput(s.torque),
      })),
      lines: lines.map((l) => {
        const quantity = toCount(l.quantity);
        const [target, value] = l.choice.split(":");
        return target === "item"
          ? { target: "item", itemId: Number(value), quantity }
          : target === "type"
            ? { target: "type", componentTypeCode: value, quantity }
            : { target: "label", label: l.label.trim(), quantity };
      }),
      resources: resources.map((r) => {
        const minutesOf = toCount(r.minutes);
        return r.kind === "note"
          ? {
              kind: r.kind,
              url: null,
              title: r.title.trim() || null,
              durationS: null,
              body: r.body.trim(),
            }
          : {
              kind: r.kind,
              url: r.url.trim(),
              title: r.title.trim() || null,
              durationS:
                r.kind === "video" && minutesOf != null && !Number.isNaN(minutesOf)
                  ? minutesOf * 60
                  : null,
              body: null,
            };
      }),
    };
    setTitleError(null);
    setError(null);
    setPending(true);
    const result = await onSubmit(input).catch(
      () => "Enregistrement impossible. Vérifie la connexion et réessaie.",
    );
    setPending(false);
    setError(result);
  }

  const groups: { label: string; kind: InventoryItemVM["kind"] }[] = [
    { label: "Outils de l'atelier", kind: "tool" },
    { label: "Produits de l'atelier", kind: "product" },
    { label: "Pièces de l'atelier", kind: "part" },
  ];
  const partLike = (choice: string) =>
    choice.startsWith("type:") ||
    (choice.startsWith("item:") &&
      items.find((item) => item.id === Number(choice.slice(5)))?.kind === "part");

  return (
    <SheetForm onSubmit={submit}>
      <SheetBody>
        {error ? <FieldError>{error}</FieldError> : null}
        <Field label="Titre" error={titleError}>
          <Input
            ref={titleRef}
            autoComplete="off"
            placeholder="Ex. Purge des freins"
            value={title}
            data-autofocus=""
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
          />
        </Field>
        <Field label="Description" hint="Facultative.">
          <Textarea
            value={description}
            placeholder="Quand la faire, à quoi faire attention…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Fieldset legend="Vélos" hint="plusieurs possibles, ou aucun">
          <ChipRow>
            <Chip
              type="checkbox"
              checked={selectedBikes === "all"}
              onChange={(e) => toggleBike("all", e.target.checked)}
            >
              <Bike aria-hidden />
              Tous les vélos
            </Chip>
            {bikes.map((bike) => (
              <Chip
                key={bike.id}
                type="checkbox"
                checked={selectedBikes !== "all" && selectedBikes.includes(bike.id)}
                onChange={(e) => toggleBike(bike.id, e.target.checked)}
              >
                <BikeCover
                  as="span"
                  cover={bike.cover}
                  bare
                  className="-ml-2 size-7 rounded-full"
                />
                {bike.name}
              </Chip>
            ))}
          </ChipRow>
        </Fieldset>

        <div className="grid gap-2.5 md:grid-cols-2">
          <Field label="Type de pièce">
            <NativeSelect value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
              <option value="">Aucun en particulier</option>
              {componentTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Modèle" hint="Facultatif, pour t'y retrouver.">
            <Input
              autoComplete="off"
              placeholder="Ex. SRAM Maven"
              value={modelHint}
              onChange={(e) => setModelHint(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5">
          <Field label="Durée">
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="45"
              suffix="min"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Fieldset legend="Difficulté">
            <ChipRow>
              {PROCEDURE_DIFFICULTIES.map((value) => (
                <Chip
                  key={value}
                  type="checkbox"
                  size="sm"
                  checked={difficulty === value}
                  onChange={(e) => setDifficulty(e.target.checked ? value : null)}
                >
                  {PROCEDURE_DIFFICULTY_LABELS[value]}
                </Chip>
              ))}
            </ChipRow>
          </Fieldset>
        </div>

        {/* Steps */}
        <Fieldset legend="Étapes" hint="dans l'ordre">
          <p className="sr-only" role="status" aria-live="polite">
            {announce}
          </p>
          {steps.length ? (
            <ol ref={listRef} className="m-0 grid list-none gap-2.5 p-0">
              {steps.map((step, index) => (
                <li
                  key={step.key}
                  className="grid gap-2.5 rounded-card border border-border bg-surface p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold">
                      Étape {index + 1}
                      {step.photoCount ? (
                        <span className="hint">
                          {" "}
                          · {step.photoCount} photo{step.photoCount > 1 ? "s" : ""}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-step={step.key}
                        data-move="up"
                        disabled={index === 0}
                        aria-label={`Monter l'étape ${index + 1}`}
                        onClick={() => moveStep(step.key, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-step={step.key}
                        data-move="down"
                        disabled={index === steps.length - 1}
                        aria-label={`Descendre l'étape ${index + 1}`}
                        onClick={() => moveStep(step.key, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Retirer l'étape ${index + 1}`}
                        onClick={() =>
                          step.photoCount ? setConfirmStep(step.key) : removeStep(step.key)
                        }
                      >
                        <X />
                      </Button>
                    </span>
                  </div>
                  {confirmStep === step.key ? (
                    <div role="group" aria-label="Retirer l'étape" className="grid gap-2">
                      <p className="text-[13.5px]">
                        Ses {step.photoCount} photo{step.photoCount > 1 ? "s" : ""} seront
                        supprimées à l&apos;enregistrement.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmStep(null)}
                        >
                          Garder
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          autoFocus
                          onClick={() => removeStep(step.key)}
                        >
                          <Trash2 />
                          Retirer l&apos;étape
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <Field label="Consigne" hideLabel>
                    <Textarea
                      data-step-text={step.key}
                      aria-label={`Consigne de l'étape ${index + 1}`}
                      placeholder="Ce qu'il faut faire"
                      value={step.instruction}
                      onChange={(e) => patchStep(step.key, { instruction: e.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5">
                    <Field label="Couple">
                      <Input
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="—"
                        suffix="N·m"
                        value={step.torque}
                        onChange={(e) => patchStep(step.key, { torque: e.target.value })}
                      />
                    </Field>
                    <Field label="Note">
                      <Input
                        autoComplete="off"
                        placeholder="Facultative"
                        value={step.note}
                        onChange={(e) => patchStep(step.key, { note: e.target.value })}
                      />
                    </Field>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">Aucune étape pour l&apos;instant.</p>
          )}
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={addStep}>
              <Plus />
              Ajouter une étape
            </Button>
          </div>
          <p className="hint">
            Couples de serrage : ceux du manuel de ta pièce. Les photos de référence s&apos;ajoutent
            sur la fiche, étape par étape.
          </p>
        </Fieldset>

        {/* Material */}
        <Fieldset legend="Matériel" hint="depuis l'atelier, ou à ajouter">
          {lines.length ? (
            <ul className="m-0 grid list-none gap-2.5 p-0">
              {lines.map((line, index) => (
                <li
                  key={line.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-card border border-border bg-surface p-3"
                >
                  <div className="grid gap-2">
                    <Field label={`Matériel ${index + 1}`} hideLabel>
                      <NativeSelect
                        aria-label={`Matériel ${index + 1}`}
                        value={line.choice}
                        onChange={(e) => patchLine(line.key, { choice: e.target.value })}
                      >
                        {groups.map(({ label, kind }) => {
                          const own = items.filter((item) => item.kind === kind);
                          return own.length ? (
                            <optgroup key={kind} label={label}>
                              {own.map((item) => (
                                <option key={item.id} value={`item:${item.id}`}>
                                  {item.name}
                                </option>
                              ))}
                            </optgroup>
                          ) : null;
                        })}
                        <optgroup label="Une pièce de ce type, selon le vélo">
                          {componentTypes.map((type) => (
                            <option key={type.code} value={`type:${type.code}`}>
                              {type.label} (selon le vélo)
                            </option>
                          ))}
                        </optgroup>
                        <option value="label">Pas encore dans l&apos;atelier…</option>
                      </NativeSelect>
                    </Field>
                    {line.choice === "label" ? (
                      <Field label="Nom" hideLabel>
                        <Input
                          aria-label={`Nom du matériel ${index + 1}`}
                          autoComplete="off"
                          placeholder="Ex. Huile de fourche 15 WT"
                          value={line.label}
                          onChange={(e) => patchLine(line.key, { label: e.target.value })}
                        />
                      </Field>
                    ) : null}
                    {partLike(line.choice) ? (
                      <Field label="Quantité par entretien">
                        <Input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          placeholder="1"
                          value={line.quantity}
                          onChange={(e) =>
                            patchLine(line.key, { quantity: e.target.value.replace(/\D/g, "") })
                          }
                        />
                      </Field>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Retirer le matériel ${index + 1}`}
                    onClick={() => setLines((list) => list.filter((l) => l.key !== line.key))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setLines((list) => [
                  ...list,
                  {
                    key: key(),
                    choice: items[0] ? `item:${items[0].id}` : "label",
                    label: "",
                    quantity: "",
                  },
                ])
              }
            >
              <Plus />
              Ajouter du matériel
            </Button>
          </div>
        </Fieldset>

        {/* Resources */}
        <Fieldset legend="Ressources" hint="vidéo, lien, note">
          {resources.length ? (
            <ul className="m-0 grid list-none gap-2.5 p-0">
              {resources.map((resource, index) => (
                <li
                  key={resource.key}
                  className="grid gap-2 rounded-card border border-border bg-surface p-3"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                    <Field label={`Ressource ${index + 1}`}>
                      <NativeSelect
                        value={resource.kind}
                        onChange={(e) =>
                          patchResource(resource.key, {
                            kind: e.target.value as ProcedureResourceKind,
                          })
                        }
                      >
                        {PROCEDURE_RESOURCE_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {PROCEDURE_RESOURCE_KIND_LABELS[kind]}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Retirer la ressource ${index + 1}`}
                      onClick={() =>
                        setResources((list) => list.filter((r) => r.key !== resource.key))
                      }
                    >
                      <X />
                    </Button>
                  </div>
                  {resource.kind === "note" ? null : (
                    <Field
                      label="Adresse"
                      hint={
                        resource.kind === "video"
                          ? "Ouverte sur son site : jamais de lecteur intégré."
                          : undefined
                      }
                    >
                      <Input
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        placeholder="https://…"
                        value={resource.url}
                        onChange={(e) => patchResource(resource.key, { url: e.target.value })}
                      />
                    </Field>
                  )}
                  <div
                    className={
                      resource.kind === "video"
                        ? "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2.5"
                        : "grid"
                    }
                  >
                    <Field
                      label="Titre"
                      hint={resource.kind === "note" ? "Facultatif." : undefined}
                    >
                      <Input
                        autoComplete="off"
                        placeholder={resource.kind === "video" ? "Ex. Purge pas à pas" : ""}
                        value={resource.title}
                        onChange={(e) => patchResource(resource.key, { title: e.target.value })}
                      />
                    </Field>
                    {resource.kind === "video" ? (
                      <Field label="Durée">
                        <Input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          suffix="min"
                          value={resource.minutes}
                          onChange={(e) =>
                            patchResource(resource.key, {
                              minutes: e.target.value.replace(/\D/g, ""),
                            })
                          }
                        />
                      </Field>
                    ) : null}
                  </div>
                  {resource.kind === "note" ? (
                    <Field label="Texte">
                      <Textarea
                        value={resource.body}
                        onChange={(e) => patchResource(resource.key, { body: e.target.value })}
                      />
                    </Field>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setResources((list) => [
                  ...list,
                  { key: key(), kind: "video", url: "", title: "", minutes: "", body: "" },
                ])
              }
            >
              <Plus />
              Ajouter une ressource
            </Button>
          </div>
        </Fieldset>

        {editing ? null : <AttachmentsLater />}
      </SheetBody>
      <SheetFooter className="grid gap-2">
        {confirmDelete && editing && onDelete ? (
          <DeleteConfirm
            question={`Supprimer « ${editing.title} » pour de bon ? Ses étapes, son matériel, ses photos et ses documents seront supprimés${editing.links.length ? ` ; ${editing.links.length} règle${editing.links.length > 1 ? "s ou tâches perdront" : " ou tâche perdra"} le lien` : ""}.`}
            confirmLabel="Supprimer la fiche"
            pending={pending}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              setPending(true);
              const result = await onDelete().catch(() => "Suppression impossible. Réessaie.");
              setPending(false);
              if (result) {
                setError(result);
                setConfirmDelete(false);
              }
            }}
          />
        ) : (
          <>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              <Check />
              {editing ? "Enregistrer" : "Créer la fiche"}
            </Button>
            {editing && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Supprimer la fiche…
              </Button>
            ) : null}
          </>
        )}
      </SheetFooter>
    </SheetForm>
  );
}
