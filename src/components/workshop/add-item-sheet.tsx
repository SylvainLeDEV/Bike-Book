"use client";

import * as React from "react";
import { Bike, Camera, Check, ChevronRight } from "lucide-react";
import { BikeCover } from "@/components/bike-cover";
import { KIND_ICONS } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { ChoiceCard } from "@/components/ui/choice-card";
import { Field, FieldError, Fieldset, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import {
  CONTAINER_SUGGESTIONS,
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_KIND_LABELS,
  PRODUCT_LEVEL_LABELS,
  UNIT_LABELS,
} from "@/lib/labels";
import { parseMoneyInput } from "@/lib/parse";
import type {
  AddItemInput,
  BikeRef,
  ComponentTypeOption,
  InventoryCategory,
  InventoryKind,
  InventoryUnit,
  ProductLevel,
} from "@/lib/view-models";

export type AddItemPrefill = Partial<{
  kind: InventoryKind;
  name: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  componentTypeCode: string;
}>;

const CATEGORY_ORDER: InventoryCategory[] = [
  "brakes",
  "drivetrain",
  "suspension",
  "wheels",
  "frame",
  "cockpit",
  "electric",
  "care",
  "other",
];

/** The three kinds, each with what it is tracked as (the mockup's cards, D-33). */
const KINDS: {
  kind: InventoryKind;
  meta: string;
  placeholder: string;
  category: InventoryCategory;
}[] = [
  {
    kind: "part",
    meta: "Comptée à l'unité : plaquettes, chaîne, chambre à air",
    placeholder: "Ex. Plaquettes Maven organiques",
    category: "brakes",
  },
  {
    kind: "product",
    meta: "Suivi au niveau : graisse, huile, préventif",
    placeholder: "Ex. Huile minérale Shimano",
    category: "care",
  },
  {
    kind: "tool",
    meta: "Possédé ou non : clé dynamométrique, kit de purge",
    placeholder: "Ex. Kit de purge",
    category: "other",
  },
];

const OPEN_LEVELS: Exclude<ProductLevel, "empty">[] = ["full", "started", "low"];

function toCount(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * "Ajouter un objet" (D-33, D-85): the kind first (three cards), then a short form for it; the
 * storage place, photo, purchase link and notes folded away. Bikes are chips, "Tous les vélos"
 * exclusive. "Modifier l'objet" keeps the kind and leaves the stock to its own actions.
 */
export function AddItemSheet({
  open,
  onOpenChange,
  bikes,
  componentTypes,
  prefill,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bikes: BikeRef[];
  componentTypes: ComponentTypeOption[];
  prefill?: AddItemPrefill | null;
  /** "Modifier l'objet": its current values; stock and links change through their own actions. */
  editing?: AddItemInput | null;
  /** Saves; an `{ ok: false }` answer keeps the sheet open with its message. */
  onSubmit: (input: AddItemInput) => void | Promise<void | { ok: false; error: string }>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={editing ? "Modifier l'objet" : "Ajouter un objet"}
        description={
          editing
            ? `${INVENTORY_KIND_LABELS[editing.kind]} · ${editing.name}`
            : "Une pièce, un produit ou un outil de l'atelier."
        }
      >
        {open ? (
          <AddItemForm
            bikes={bikes}
            componentTypes={componentTypes}
            prefill={prefill ?? null}
            editing={editing ?? null}
            onSubmit={async (input) => {
              const result = await onSubmit(input);
              if (result && !result.ok) return result.error;
              onOpenChange(false);
              return null;
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AddItemForm({
  bikes,
  componentTypes,
  prefill,
  editing,
  onSubmit,
}: {
  bikes: BikeRef[];
  componentTypes: ComponentTypeOption[];
  prefill: AddItemPrefill | null;
  editing: AddItemInput | null;
  /** Resolves with an error message, or null once saved. */
  onSubmit: (input: AddItemInput) => Promise<string | null>;
}) {
  const [kind, setKind] = React.useState<InventoryKind | null>(
    editing?.kind ?? prefill?.kind ?? null,
  );
  const [kindError, setKindError] = React.useState<string | null>(null);
  const [name, setName] = React.useState(editing?.name ?? prefill?.name ?? "");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [category, setCategory] = React.useState<InventoryCategory | null>(
    editing?.category ?? prefill?.category ?? null,
  );
  const [selectedBikes, setSelectedBikes] = React.useState<"all" | number[]>(editing?.bikes ?? []);
  const [unit, setUnit] = React.useState<InventoryUnit>(
    (editing?.kind === "part" ? editing.unit : null) ?? prefill?.unit ?? "piece",
  );
  const [level, setLevel] = React.useState<Exclude<ProductLevel, "empty">>("full");
  const [owned, setOwned] = React.useState(true);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const kindRef = React.useRef<HTMLInputElement>(null);
  const kindInfo = KINDS.find((k) => k.kind === kind) ?? null;
  // The kind's own category until one is picked.
  const shownCategory = category ?? kindInfo?.category ?? "brakes";

  function toggleBike(id: number | "all", checked: boolean) {
    if (id === "all") return setSelectedBikes(checked ? "all" : []);
    setSelectedBikes((current) => {
      const list = current === "all" ? [] : current;
      return checked ? [...list, id] : list.filter((b) => b !== id);
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) {
      setKindError("Choisis d'abord un type d'objet.");
      kindRef.current?.focus();
      return;
    }
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim() || null;
    if (!name.trim()) {
      setNameError("Donne un nom à l'objet.");
      nameRef.current?.focus();
      return;
    }
    const price = parseMoneyInput(String(data.get("price") ?? ""));
    const shopName = text("shop");
    const url = text("url");
    const common = {
      name: name.trim(),
      brand: text("brand"),
      reference: text("reference"),
      category: shownCategory,
      componentTypeCode: text("componentType"),
      bikes: selectedBikes,
      location: text("location"),
      link:
        shopName || url
          ? { shopName, url, priceCents: price != null && !Number.isNaN(price) ? price : null }
          : null,
      notes: text("notes"),
    };
    const input: AddItemInput =
      kind === "part"
        ? {
            ...common,
            kind,
            quantity: toCount(String(data.get("quantity") ?? "")) ?? 0,
            unit,
            lowStockThreshold: toCount(String(data.get("threshold") ?? "")),
          }
        : kind === "product"
          ? {
              ...common,
              kind,
              containers: toCount(String(data.get("containers") ?? "")) ?? 0,
              level,
              containerLabel: text("container"),
            }
          : { ...common, kind, owned };
    setFormError(null);
    setPending(true);
    const error = await onSubmit(input).catch(
      () => "Enregistrement impossible. Vérifie la connexion et réessaie.",
    );
    setPending(false);
    setFormError(error);
  }

  return (
    <SheetForm onSubmit={submit}>
      <SheetBody>
        {formError ? <FieldError>{formError}</FieldError> : null}
        {editing ? null : (
          <Fieldset legend="Type d'objet" error={kindError}>
            <div className="grid gap-2">
              {KINDS.map(({ kind: value, meta }, index) => {
                const Icon = KIND_ICONS[value];
                return (
                  <ChoiceCard
                    key={value}
                    ref={index === 0 ? kindRef : undefined}
                    name="kind"
                    value={value}
                    checked={kind === value}
                    data-autofocus={index === 0 && !prefill?.kind ? "" : undefined}
                    onChange={() => {
                      setKind(value);
                      setKindError(null);
                    }}
                    icon={<Icon aria-hidden />}
                    title={INVENTORY_KIND_LABELS[value]}
                    meta={meta}
                  />
                );
              })}
            </div>
          </Fieldset>
        )}

        {kind ? (
          <>
            <Field label="Nom" error={nameError}>
              <Input
                ref={nameRef}
                name="name"
                autoComplete="off"
                placeholder={kindInfo?.placeholder}
                value={name}
                data-autofocus={editing || prefill?.kind ? "" : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Marque">
                <Input
                  name="brand"
                  autoComplete="off"
                  placeholder="Ex. SRAM"
                  defaultValue={editing?.brand ?? ""}
                />
              </Field>
              <Field label="Référence">
                <Input
                  name="reference"
                  autoComplete="off"
                  placeholder="Facultatif"
                  defaultValue={editing?.reference ?? ""}
                />
              </Field>
            </div>
            <div className="grid gap-2.5 md:grid-cols-2">
              <Field label="Catégorie">
                <NativeSelect
                  name="category"
                  value={shownCategory}
                  onChange={(e) => setCategory(e.target.value as InventoryCategory)}
                >
                  {CATEGORY_ORDER.map((value) => (
                    <option key={value} value={value}>
                      {INVENTORY_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label="Type de pièce"
                hint={
                  kind === "part"
                    ? "Pour la proposer au remplacement."
                    : "Pour le relier aux entretiens de ce type de pièce."
                }
              >
                <NativeSelect
                  name="componentType"
                  defaultValue={editing?.componentTypeCode ?? prefill?.componentTypeCode ?? ""}
                >
                  <option value="">Aucun en particulier</option>
                  {componentTypes.map((type) => (
                    <option key={type.code} value={type.code}>
                      {type.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <Fieldset legend="Vélos" hint="plusieurs possibles, ou aucun">
              <ChipRow>
                <Chip
                  type="checkbox"
                  name="bikes"
                  value="all"
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
                    name="bikes"
                    value={bike.id}
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

            {kind === "part" ? (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  {editing ? null : (
                    <Field label="En stock">
                      <Input
                        name="quantity"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        defaultValue="1"
                      />
                    </Field>
                  )}
                  <Field label="Alerte à partir de">
                    <Input
                      name="threshold"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="Aucune"
                      defaultValue={
                        editing?.kind === "part" ? (editing.lowStockThreshold ?? "") : ""
                      }
                    />
                  </Field>
                </div>
                <Fieldset legend="Unité">
                  <ChipRow>
                    {(Object.keys(UNIT_LABELS) as InventoryUnit[]).map((value) => (
                      <Chip
                        key={value}
                        name="unit"
                        value={value}
                        checked={unit === value}
                        onChange={() => setUnit(value)}
                      >
                        {UNIT_LABELS[value][0].charAt(0).toUpperCase() +
                          UNIT_LABELS[value][0].slice(1)}
                      </Chip>
                    ))}
                  </ChipRow>
                </Fieldset>
              </>
            ) : null}

            {kind === "product" ? (
              <>
                {editing ? null : (
                  <>
                    <Fieldset legend="Niveau du contenant entamé">
                      <ChipRow>
                        {OPEN_LEVELS.map((value) => (
                          <Chip
                            key={value}
                            name="level"
                            value={value}
                            checked={level === value}
                            onChange={() => setLevel(value)}
                          >
                            {PRODUCT_LEVEL_LABELS[value]}
                          </Chip>
                        ))}
                      </ChipRow>
                    </Fieldset>
                  </>
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  {editing ? null : (
                    <Field label="En stock" hint="Celui entamé compris.">
                      <Input
                        name="containers"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        defaultValue="1"
                      />
                    </Field>
                  )}
                  <Field label="Contenant" hint="Flacon, bidon, tube…">
                    <Input
                      name="container"
                      autoComplete="off"
                      list="item-container-options"
                      placeholder={CONTAINER_SUGGESTIONS[0]}
                      defaultValue={
                        editing?.kind === "product" ? (editing.containerLabel ?? "") : ""
                      }
                    />
                  </Field>
                  <datalist id="item-container-options">
                    {CONTAINER_SUGGESTIONS.map((label) => (
                      <option key={label} value={label} />
                    ))}
                  </datalist>
                </div>
              </>
            ) : null}

            {kind === "tool" && !editing ? (
              <Fieldset legend="Possession" hint="« À acheter » le met dans « À racheter »">
                <ChipRow>
                  <Chip name="owned" value="yes" checked={owned} onChange={() => setOwned(true)}>
                    <Check aria-hidden />
                    Je l&apos;ai
                  </Chip>
                  <Chip name="owned" value="no" checked={!owned} onChange={() => setOwned(false)}>
                    À acheter
                  </Chip>
                </ChipRow>
              </Fieldset>
            ) : null}

            <details className="group border-t border-border pt-1">
              <summary className="flex min-h-11 list-none items-center gap-2 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-[18px] transition-transform group-open:rotate-90"
                  aria-hidden
                />
                Plus de détails <span className="hint">rangement, lien d&apos;achat, notes</span>
              </summary>
              <div className="grid gap-4 pt-1.5">
                <Field label="Rangement">
                  <Input
                    name="location"
                    autoComplete="off"
                    placeholder="Ex. Établi, tiroir 2"
                    defaultValue={editing?.location ?? ""}
                  />
                </Field>
                <p className="flex items-start gap-1.5 hint">
                  <Camera className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {editing
                    ? "Sa photo, ses factures et notices se gèrent sur la fiche de l'objet."
                    : "Sa photo, ses factures et notices : sur la fiche de l'objet, une fois ajouté."}
                </p>
                {editing ? null : (
                  <Fieldset legend="Lien d'achat" hint="affiché, jamais consulté par l'app">
                    <div className="grid grid-cols-2 gap-2.5">
                      <Field label="Boutique">
                        <Input name="shop" autoComplete="off" placeholder="Ex. Cycles du Lac" />
                      </Field>
                      <Field label="Prix">
                        <Input
                          name="price"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0,00"
                          suffix="€"
                        />
                      </Field>
                    </div>
                    <Field label="Adresse de la page">
                      <Input
                        name="url"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        placeholder="https://…"
                      />
                    </Field>
                  </Fieldset>
                )}
                <Field label="Notes">
                  <Textarea
                    name="notes"
                    placeholder="Compatibilité, couple de serrage, astuces…"
                    defaultValue={editing?.notes ?? ""}
                  />
                </Field>
              </div>
            </details>
          </>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Check />
          {editing ? "Enregistrer" : "Ajouter à l'atelier"}
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}
