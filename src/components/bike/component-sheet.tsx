"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, FieldError, Fieldset, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Fold } from "@/components/ui/fold";
import { AttachmentsBlock, AttachmentsLater } from "@/components/attachments/attachments-block";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { COMPONENT_GROUPS, type ComponentTypeCode } from "@/lib/enums";
import { formatDate, formatDecimal, type LocalDate } from "@/lib/format";
import { COMPONENT_GROUP_LABELS, EVIDENCE_LEVEL_LABELS, SHOP_KIND_LABELS } from "@/lib/labels";
import { nameKey } from "@/lib/names";
import { decimalText, parseDecimalInput, parseMoneyInput } from "@/lib/parse";
import type {
  ComponentFormVM,
  ComponentInput,
  ComponentTypeChoice,
  RuleTemplateChoice,
  SaveComponentResult,
  ShopKind,
  ShopOption,
} from "@/lib/view-models";

/*
 * "Ajouter un composant" / "Modifier le composant" (validated on 2026-10-26, D-62): type,
 * position, brand and model, origin and fitting date; reference, warranty, purchase, usage before
 * tracking and notes folded. A part fitted by a replacement keeps the replacement's date.
 */

const POSITION_CHOICES = { front: "Avant", rear: "Arrière" } as const;

export type ComponentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bikeName: string;
  types: ComponentTypeChoice[];
  /** Rule templates offered for a new part's type (feature 6). */
  templates: RuleTemplateChoice[];
  /** null: a new part. */
  component: ComponentFormVM | null;
  /** "Montée le" of an original part: the bike's purchase date. */
  stockInstalledOn: LocalDate;
  today: LocalDate;
  shops: ShopOption[];
  onSubmit: (componentId: number | null, input: ComponentInput) => Promise<SaveComponentResult>;
};

export function ComponentSheet({
  open,
  onOpenChange,
  component,
  bikeName,
  ...props
}: ComponentSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={component ? "Modifier le composant" : "Ajouter un composant"}
        description={bikeName}
      >
        {open ? (
          <ComponentForm
            {...props}
            component={component}
            onSubmit={async (input) => {
              const result = await props.onSubmit(component?.id ?? null, input);
              if (result.ok) onOpenChange(false);
              return result;
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type Values = {
  typeCode: ComponentTypeCode | "";
  position: "front" | "rear";
  brand: string;
  model: string;
  origin: "stock" | "upgrade";
  installedOn: string;
  reference: string;
  warrantyEndsOn: string;
  purchasedOn: string;
  purchasePrice: string;
  shopName: string;
  shopKind: ShopKind;
  initialKm: string;
  initialHours: string;
  notes: string;
};

type Errors = Partial<Record<keyof ComponentInput, string>> & { form?: string };

const FIELD_IDS: { field: keyof ComponentInput; id: string; folded?: boolean }[] = [
  { field: "typeCode", id: "part-type" },
  { field: "position", id: "part-position-front" },
  { field: "brand", id: "part-brand" },
  { field: "model", id: "part-model" },
  { field: "installedOn", id: "part-installed-on" },
  { field: "reference", id: "part-reference", folded: true },
  { field: "warrantyEndsOn", id: "part-warranty", folded: true },
  { field: "purchasedOn", id: "part-bought-on", folded: true },
  { field: "purchasePriceCents", id: "part-price", folded: true },
  { field: "shop", id: "part-shop", folded: true },
  { field: "initialDistanceM", id: "part-initial-km", folded: true },
  { field: "initialWearS", id: "part-initial-hours", folded: true },
  { field: "notes", id: "part-notes", folded: true },
];

function ComponentForm({
  types,
  templates,
  component,
  stockInstalledOn,
  today,
  shops,
  onSubmit,
}: Omit<ComponentSheetProps, "open" | "onOpenChange" | "bikeName" | "onSubmit"> & {
  onSubmit: (input: ComponentInput) => Promise<SaveComponentResult>;
}) {
  const [values, setValues] = React.useState<Values>(() => ({
    typeCode: component?.typeCode ?? "",
    position: component?.position === "rear" ? "rear" : "front",
    brand: component?.brand ?? "",
    model: component?.model ?? "",
    origin: component && component.origin !== "stock" ? "upgrade" : "stock",
    installedOn: component?.installedOn ?? stockInstalledOn,
    reference: component?.reference ?? "",
    warrantyEndsOn: component?.warrantyEndsOn ?? "",
    purchasedOn: component?.purchasedOn ?? "",
    purchasePrice:
      component?.purchasePriceCents != null
        ? formatDecimal(component.purchasePriceCents / 100, 2)
        : "",
    shopName: component?.shop?.name ?? "",
    shopKind: component?.shop?.kind ?? "physical",
    initialKm: component?.initialDistanceM ? decimalText(component.initialDistanceM / 1000, 3) : "",
    initialHours: component?.initialWearS ? decimalText(component.initialWearS / 3600, 2) : "",
    notes: component?.notes ?? "",
  }));
  const [dateTouched, setDateTouched] = React.useState(component != null);
  // Proposed rules for the chosen type: all ticked; the person unticks what does not apply.
  const [chosenTemplates, setChosenTemplates] = React.useState<number[]>([]);
  const [errors, setErrors] = React.useState<Errors>({});
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const editing = component != null;
  const locked = component?.fromReplacement ?? false;
  const type = types.find((t) => t.code === values.typeCode);
  const shopIsNew =
    values.shopName.trim() !== "" &&
    !shops.some((shop) => nameKey(shop.name) === nameKey(values.shopName));

  function chooseOrigin(origin: "stock" | "upgrade") {
    set("origin", origin);
    // Until the date is changed by hand, it follows the origin.
    if (!dateTouched) set("installedOn", origin === "stock" ? stockInstalledOn : today);
  }

  function showErrors(next: Errors) {
    setErrors(next);
    const first = FIELD_IDS.find(({ field }) => next[field]);
    if (!first) return;
    if (first.folded) setDetailsOpen(true);
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>(`#${first.id}`)?.focus(),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {};
    const number = (text: string, field: keyof ComponentInput, scale: number) => {
      const value = parseDecimalInput(text);
      if (value != null && Number.isNaN(value)) next[field] = "Nombre invalide.";
      return value == null || Number.isNaN(value) ? 0 : Math.round(value * scale);
    };
    if (!type) next.typeCode = "Choisis un type de pièce.";
    if (!values.brand.trim() && !values.model.trim()) {
      next.model = "Indique au moins la marque ou le modèle.";
    }
    if (!values.installedOn) next.installedOn = "Indique la date de montage.";
    const priceCents = parseMoneyInput(values.purchasePrice);
    if (priceCents != null && Number.isNaN(priceCents))
      next.purchasePriceCents = "Montant invalide.";
    const initialDistanceM = number(values.initialKm, "initialDistanceM", 1000);
    const initialWearS = number(values.initialHours, "initialWearS", 3600);
    if (Object.keys(next).length || !type) {
      showErrors(next);
      return;
    }
    const shopName = values.shopName.trim();
    const known = shops.find((shop) => nameKey(shop.name) === nameKey(shopName));
    const input: ComponentInput = {
      templateIds: editing ? [] : chosenTemplates,
      typeCode: type.code,
      position: type.hasPosition ? values.position : "none",
      brand: values.brand.trim() || null,
      model: values.model.trim() || null,
      reference: values.reference.trim() || null,
      origin: values.origin,
      installedOn: values.installedOn,
      initialDistanceM,
      initialWearS,
      purchasedOn: values.purchasedOn || null,
      purchasePriceCents: priceCents,
      shop: shopName ? { name: shopName, kind: known?.kind ?? values.shopKind } : null,
      warrantyEndsOn: values.warrantyEndsOn || null,
      notes: values.notes.trim() || null,
    };
    setErrors({});
    setPending(true);
    try {
      const result = await onSubmit(input);
      if (!result.ok) showErrors({ ...result.fieldErrors, form: result.error });
    } catch {
      setErrors({ form: "Enregistrement impossible. Vérifie la connexion et réessaie." });
    } finally {
      setPending(false);
    }
  }

  return (
    <SheetForm ref={formRef} onSubmit={submit}>
      <SheetBody>
        {errors.form ? <FieldError>{errors.form}</FieldError> : null}
        <Field label="Type" id="part-type" error={errors.typeCode}>
          <NativeSelect
            value={values.typeCode}
            disabled={editing}
            data-autofocus={editing ? undefined : ""}
            onChange={(e) => {
              const code = e.target.value as ComponentTypeCode | "";
              set("typeCode", code);
              setChosenTemplates(
                templates.filter((t) => t.componentTypeCode === code).map((t) => t.id),
              );
            }}
          >
            {values.typeCode ? null : <option value="">Choisis…</option>}
            {COMPONENT_GROUPS.map((group) => {
              const list = types.filter((t) => t.group === group);
              return list.length ? (
                <optgroup key={group} label={COMPONENT_GROUP_LABELS[group]}>
                  {list.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </NativeSelect>
        </Field>

        {type?.hasPosition ? (
          <Fieldset legend="Position" error={errors.position}>
            <ChipRow>
              {(["front", "rear"] as const).map((position) => (
                <Chip
                  key={position}
                  id={`part-position-${position}`}
                  name="position"
                  value={position}
                  checked={values.position === position}
                  disabled={editing}
                  onChange={() => set("position", position)}
                >
                  {POSITION_CHOICES[position]}
                </Chip>
              ))}
            </ChipRow>
          </Fieldset>
        ) : null}

        {!editing && type && templates.some((t) => t.componentTypeCode === type.code) ? (
          <Fieldset
            legend="Règles d'entretien proposées"
            hint="des repères à ajuster au manuel de ta pièce"
          >
            <ul className="m-0 grid list-none gap-1 p-0">
              {templates
                .filter((t) => t.componentTypeCode === type.code)
                .map((template) => (
                  <li key={template.id}>
                    <label className="flex min-h-9 items-start gap-2.5 py-1 text-[14px] pointer-coarse:min-h-11">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-[18px] shrink-0 accent-[var(--brand)]"
                        checked={chosenTemplates.includes(template.id)}
                        onChange={(e) =>
                          setChosenTemplates((ids) =>
                            e.target.checked
                              ? [...ids, template.id]
                              : ids.filter((id) => id !== template.id),
                          )
                        }
                      />
                      <span>
                        {template.title} · {template.intervalText}
                        <span className="block hint">
                          {EVIDENCE_LEVEL_LABELS[template.evidenceLevel]}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
            </ul>
          </Fieldset>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Marque" id="part-brand" error={errors.brand}>
            <Input
              autoComplete="off"
              maxLength={60}
              placeholder="Ex. RockShox"
              value={values.brand}
              data-autofocus={editing ? "" : undefined}
              onChange={(e) => set("brand", e.target.value)}
            />
          </Field>
          <Field label="Modèle" id="part-model" error={errors.model}>
            <Input
              autoComplete="off"
              maxLength={80}
              placeholder="Ex. Lyrik Ultimate"
              value={values.model}
              onChange={(e) => set("model", e.target.value)}
            />
          </Field>
        </div>

        {locked ? (
          <p className="hint">
            Montée lors d&apos;un remplacement le{" "}
            {formatDate(values.installedOn, { year: "always" })} : sa date suit le remplacement.
          </p>
        ) : (
          <>
            <Fieldset legend="Origine">
              <ChipRow>
                <Chip
                  name="origin"
                  value="stock"
                  checked={values.origin === "stock"}
                  onChange={() => chooseOrigin("stock")}
                >
                  D&apos;origine
                </Chip>
                <Chip
                  name="origin"
                  value="upgrade"
                  checked={values.origin === "upgrade"}
                  onChange={() => chooseOrigin("upgrade")}
                >
                  Ajoutée plus tard
                </Chip>
              </ChipRow>
            </Fieldset>
            <Field
              label="Montée le"
              id="part-installed-on"
              error={errors.installedOn}
              hint={
                values.origin === "stock"
                  ? "Une pièce d'origine compte toutes les sorties depuis l'achat du vélo."
                  : "Datée d'un jour passé, elle compte les sorties à partir du lendemain."
              }
            >
              <Input
                type="date"
                max={today}
                value={values.installedOn}
                onChange={(e) => {
                  setDateTouched(true);
                  set("installedOn", e.target.value);
                }}
              />
            </Field>
          </>
        )}

        <Fold
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          title="Détails"
          hint="référence, garantie, achat, usage avant le suivi, notes"
        >
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Référence" id="part-reference" error={errors.reference}>
              <Input
                autoComplete="off"
                spellCheck={false}
                maxLength={60}
                value={values.reference}
                onChange={(e) => set("reference", e.target.value)}
              />
            </Field>
            <Field label="Garantie jusqu'au" id="part-warranty" error={errors.warrantyEndsOn}>
              <Input
                type="date"
                value={values.warrantyEndsOn}
                onChange={(e) => set("warrantyEndsOn", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Date d'achat" id="part-bought-on" error={errors.purchasedOn}>
              <Input
                type="date"
                max={today}
                value={values.purchasedOn}
                onChange={(e) => set("purchasedOn", e.target.value)}
              />
            </Field>
            <Field label="Prix" id="part-price" error={errors.purchasePriceCents}>
              <Input
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                suffix="€"
                value={values.purchasePrice}
                onChange={(e) => set("purchasePrice", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Boutique" id="part-shop" error={errors.shop}>
            <Input
              autoComplete="off"
              maxLength={100}
              list="part-shop-options"
              value={values.shopName}
              onChange={(e) => set("shopName", e.target.value)}
            />
          </Field>
          <datalist id="part-shop-options">
            {shops.map((shop) => (
              <option key={shop.id} value={shop.name} />
            ))}
          </datalist>
          {shopIsNew ? (
            <Fieldset legend="Nouvelle boutique" hint="elle sera ajoutée à tes boutiques">
              <ChipRow>
                {(["physical", "online"] as const).map((kind) => (
                  <Chip
                    key={kind}
                    name="shopKind"
                    value={kind}
                    checked={values.shopKind === kind}
                    onChange={() => set("shopKind", kind)}
                  >
                    {SHOP_KIND_LABELS[kind]}
                  </Chip>
                ))}
              </ChipRow>
            </Fieldset>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="Usage avant le suivi"
              id="part-initial-km"
              error={errors.initialDistanceM}
            >
              <Input
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                suffix="km"
                value={values.initialKm}
                onChange={(e) => set("initialKm", e.target.value)}
              />
            </Field>
            <Field
              label="Heures avant le suivi"
              id="part-initial-hours"
              error={errors.initialWearS}
            >
              <Input
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                suffix="h"
                value={values.initialHours}
                onChange={(e) => set("initialHours", e.target.value)}
              />
            </Field>
          </div>
          <p className="-mt-2 hint">Pour une pièce d&apos;occasion, ou déjà usée avant ce suivi.</p>
          <Field label="Notes" id="part-notes" error={errors.notes}>
            <Textarea
              maxLength={2000}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </Fold>
        {component ? (
          <AttachmentsBlock owner={{ kind: "component", id: component.id }} />
        ) : (
          <AttachmentsLater />
        )}
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Check />
          {editing ? "Enregistrer" : "Ajouter le composant"}
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}
