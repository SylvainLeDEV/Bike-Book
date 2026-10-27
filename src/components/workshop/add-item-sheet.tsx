"use client";

import * as React from "react";
import { Bike, Camera, Check, ChevronRight } from "lucide-react";
import { BikeCover } from "@/components/bike-cover";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, FieldError, Fieldset, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { INVENTORY_CATEGORY_LABELS, UNIT_LABELS } from "@/lib/labels";
import { parseMoneyInput } from "@/lib/parse";
import type {
  AddItemInput,
  BikeRef,
  ComponentTypeOption,
  InventoryCategory,
  InventoryUnit,
} from "@/lib/view-models";

export type AddItemPrefill = Partial<
  Pick<AddItemInput, "name" | "category" | "unit" | "componentTypeCode">
>;

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

function toCount(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * "Ajouter un objet" (D-33): parts only in phase 1, a short form first, the storage place,
 * photo, purchase link and notes folded away. Bikes are chips, "Tous les vélos" exclusive.
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
          editing ? editing.name : "Une pièce de l'atelier : plaquettes, chaîne, chambre à air…"
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
  const [name, setName] = React.useState(editing?.name ?? prefill?.name ?? "");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [selectedBikes, setSelectedBikes] = React.useState<"all" | number[]>(editing?.bikes ?? []);
  const [unit, setUnit] = React.useState<InventoryUnit>(editing?.unit ?? prefill?.unit ?? "piece");
  const nameRef = React.useRef<HTMLInputElement>(null);

  function toggleBike(id: number | "all", checked: boolean) {
    if (id === "all") return setSelectedBikes(checked ? "all" : []);
    setSelectedBikes((current) => {
      const list = current === "all" ? [] : current;
      return checked ? [...list, id] : list.filter((b) => b !== id);
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    setFormError(null);
    setPending(true);
    const error = await onSubmit({
      name: name.trim(),
      brand: text("brand"),
      reference: text("reference"),
      category: (data.get("category") as InventoryCategory) ?? "other",
      componentTypeCode: text("componentType"),
      bikes: selectedBikes,
      quantity: toCount(String(data.get("quantity") ?? "")) ?? 0,
      unit,
      lowStockThreshold: toCount(String(data.get("threshold") ?? "")),
      location: text("location"),
      link:
        shopName || url
          ? { shopName, url, priceCents: price != null && !Number.isNaN(price) ? price : null }
          : null,
      notes: text("notes"),
    }).catch(() => "Enregistrement impossible. Vérifie la connexion et réessaie.");
    setPending(false);
    setFormError(error);
  }

  return (
    <SheetForm onSubmit={submit}>
      <SheetBody>
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Field label="Nom" error={nameError}>
          <Input
            ref={nameRef}
            name="name"
            autoComplete="off"
            placeholder="Ex. Plaquettes Maven organiques"
            value={name}
            data-autofocus=""
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
              defaultValue={editing?.category ?? prefill?.category ?? "brakes"}
            >
              {CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {INVENTORY_CATEGORY_LABELS[category]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Type de pièce" hint="Pour la proposer au remplacement.">
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
              defaultValue={editing?.lowStockThreshold ?? ""}
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
                {UNIT_LABELS[value][0].charAt(0).toUpperCase() + UNIT_LABELS[value][0].slice(1)}
              </Chip>
            ))}
          </ChipRow>
        </Fieldset>

        <details className="group border-t border-border pt-1">
          <summary className="flex min-h-11 list-none items-center gap-2 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-[18px] transition-transform group-open:rotate-90"
              aria-hidden
            />
            Plus de détails <span className="hint">rangement, photo, lien d&apos;achat, notes</span>
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
            <div>
              <Button variant="secondary" disabled>
                <Camera />
                Ajouter une photo
              </Button>
              <p className="mt-1 hint">Les photos arrivent avec les pièces jointes.</p>
            </div>
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
