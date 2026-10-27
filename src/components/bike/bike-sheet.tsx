"use client";

import * as React from "react";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, FieldError, Fieldset, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Fold } from "@/components/ui/fold";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { BIKE_STATUSES, WHEEL_SIZES } from "@/lib/enums";
import { formatDecimal, type LocalDate } from "@/lib/format";
import {
  BIKE_STATUS_EFFECTS,
  BIKE_STATUS_LABELS,
  DISCIPLINE_LABELS,
  DISCIPLINE_ORDER,
  SHOP_KIND_LABELS,
  WHEEL_SIZE_LABELS,
} from "@/lib/labels";
import { nameKey } from "@/lib/names";
import { decimalText, parseDecimalInput, parseMoneyInput } from "@/lib/parse";
import type {
  BikeFormVM,
  BikeInput,
  BikeStatus,
  Discipline,
  SaveBikeResult,
  ShopKind,
  ShopOption,
  WheelSize,
} from "@/lib/view-models";
import { BIKE_STATUS_ICONS } from "./bike-record";

/*
 * "Ajouter un vélo" and "Modifier le vélo" (D-43), from the mockup's sketch: the essentials
 * first, "Détails" and "Achat" folded. Choosing "Vendu" shows the sale date and price; each
 * status explains its effect in one line. Opened from anywhere through useBikeSheet().
 */

type OpenRequest = { bike: BikeFormVM | null; focus?: "status" };
type BikeSheetContextValue = { open: (request?: OpenRequest) => void };
const BikeSheetContext = React.createContext<BikeSheetContextValue | null>(null);

export function useBikeSheet(): BikeSheetContextValue {
  const value = React.useContext(BikeSheetContext);
  if (!value) throw new Error("useBikeSheet must be used inside <BikeSheetProvider>");
  return value;
}

export function BikeSheetProvider({
  today,
  shops,
  onSubmit,
  children,
}: {
  today: LocalDate;
  shops: ShopOption[];
  /** Saves the bike (`bikeId` null: a new one); the sheet closes when the result is ok. */
  onSubmit: (bikeId: number | null, input: BikeInput) => Promise<SaveBikeResult>;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<OpenRequest & { open: boolean; key: number }>({
    open: false,
    bike: null,
    key: 0,
  });
  const open = React.useCallback(
    (request: OpenRequest = { bike: null }) =>
      setState((s) => ({ ...request, open: true, key: s.key + 1 })),
    [],
  );
  const value = React.useMemo(() => ({ open }), [open]);
  const editing = state.bike != null;
  return (
    <BikeSheetContext.Provider value={value}>
      {children}
      <Sheet open={state.open} onOpenChange={(isOpen) => setState((s) => ({ ...s, open: isOpen }))}>
        <SheetContent
          title={editing ? "Modifier le vélo" : "Ajouter un vélo"}
          description={editing ? undefined : "Obligatoire : le nom et la discipline."}
        >
          <BikeForm
            key={state.key}
            bike={state.bike}
            focus={state.focus}
            shops={shops}
            today={today}
            onSubmit={async (input) => {
              const result = await onSubmit(state.bike?.id ?? null, input);
              if (result.ok) setState((s) => ({ ...s, open: false }));
              return result;
            }}
          />
        </SheetContent>
      </Sheet>
    </BikeSheetContext.Provider>
  );
}

// --- Form ------------------------------------------------------------------------------------------

type Values = {
  name: string;
  brand: string;
  model: string;
  modelYear: string;
  discipline: Discipline | "";
  isElectric: boolean;
  status: BikeStatus;
  soldOn: string;
  salePrice: string;
  frameSize: string;
  wheelSize: WheelSize | "";
  color: string;
  weightKg: string;
  frameSerial: string;
  notes: string;
  purchasedOn: string;
  purchasePrice: string;
  shopName: string;
  shopKind: ShopKind;
  boughtUsed: boolean;
  initialKm: string;
  initialHours: string;
};

type Errors = Partial<Record<keyof BikeInput, string>> & { form?: string };

function initialValues(bike: BikeFormVM | null, today: LocalDate): Values {
  const money = (cents: number | null) => (cents == null ? "" : formatDecimal(cents / 100, 2));
  return {
    name: bike?.name ?? "",
    brand: bike?.brand ?? "",
    model: bike?.model ?? "",
    modelYear: bike?.modelYear != null ? String(bike.modelYear) : "",
    discipline: bike?.discipline ?? "",
    isElectric: bike?.isElectric ?? false,
    status: bike?.status ?? "active",
    soldOn: bike?.soldOn ?? today,
    salePrice: money(bike?.salePriceCents ?? null),
    frameSize: bike?.frameSize ?? "",
    wheelSize: bike?.wheelSize ?? "",
    color: bike?.color ?? "",
    weightKg: bike?.weightG != null ? decimalText(bike.weightG / 1000, 3) : "",
    frameSerial: bike?.frameSerial ?? "",
    notes: bike?.notes ?? "",
    purchasedOn: bike?.purchasedOn ?? "",
    purchasePrice: money(bike?.purchasePriceCents ?? null),
    shopName: bike?.shop?.name ?? "",
    shopKind: bike?.shop?.kind ?? "physical",
    boughtUsed: bike?.boughtUsed ?? false,
    initialKm: bike?.initialDistanceM ? decimalText(bike.initialDistanceM / 1000, 3) : "",
    initialHours: bike?.initialWearS ? decimalText(bike.initialWearS / 3600, 2) : "",
  };
}

const INVALID_NUMBER = "Nombre invalide.";

/** Converts what was typed into a BikeInput, or the errors the person can fix right away. */
function toInput(
  values: Values,
  shops: ShopOption[],
): { input: BikeInput; errors: null } | { input: null; errors: Errors } {
  const errors: Errors = {};
  const number = (text: string, field: keyof BikeInput, scale: number): number | null => {
    const value = parseDecimalInput(text);
    if (value == null) return null;
    if (Number.isNaN(value)) {
      errors[field] = INVALID_NUMBER;
      return null;
    }
    return Math.round(value * scale);
  };
  const money = (text: string, field: keyof BikeInput): number | null => {
    const cents = parseMoneyInput(text);
    if (cents != null && Number.isNaN(cents)) {
      errors[field] = "Montant invalide.";
      return null;
    }
    return cents;
  };
  const text = (value: string) => value.trim() || null;

  if (!values.name.trim()) errors.name = "Donne un nom au vélo.";
  if (!values.discipline) errors.discipline = "Choisis une discipline.";
  const modelYear = number(values.modelYear, "modelYear", 1);
  if (modelYear != null && (modelYear < 1900 || modelYear > 2100)) {
    errors.modelYear = "Année entre 1900 et 2100.";
  }
  const sold = values.status === "sold";
  const shopName = values.shopName.trim();
  const knownShop = shops.find((shop) => nameKey(shop.name) === nameKey(shopName));

  const input: BikeInput = {
    name: values.name,
    brand: text(values.brand),
    model: text(values.model),
    modelYear,
    discipline: values.discipline || "other",
    isElectric: values.isElectric,
    status: values.status,
    soldOn: sold ? values.soldOn || null : null,
    salePriceCents: sold ? money(values.salePrice, "salePriceCents") : null,
    frameSize: text(values.frameSize),
    wheelSize: values.wheelSize || null,
    color: text(values.color),
    weightG: number(values.weightKg, "weightG", 1000),
    frameSerial: text(values.frameSerial),
    notes: text(values.notes),
    purchasedOn: values.purchasedOn || null,
    purchasePriceCents: money(values.purchasePrice, "purchasePriceCents"),
    shop: shopName ? { name: shopName, kind: knownShop?.kind ?? values.shopKind } : null,
    boughtUsed: values.boughtUsed,
    initialDistanceM: number(values.initialKm, "initialDistanceM", 1000) ?? 0,
    initialWearS: number(values.initialHours, "initialWearS", 3600) ?? 0,
  };
  return Object.keys(errors).length ? { input: null, errors } : { input, errors: null };
}

/** Where each field lives, to open its fold and focus it when it has an error. */
const FIELD_ORDER: { field: keyof BikeInput; id: string; fold?: "details" | "purchase" }[] = [
  { field: "name", id: "bike-name" },
  { field: "brand", id: "bike-brand" },
  { field: "model", id: "bike-model" },
  { field: "modelYear", id: "bike-year" },
  { field: "discipline", id: "bike-discipline" },
  { field: "soldOn", id: "bike-sold-on" },
  { field: "salePriceCents", id: "bike-sale-price" },
  { field: "frameSize", id: "bike-size", fold: "details" },
  { field: "wheelSize", id: "bike-wheels", fold: "details" },
  { field: "color", id: "bike-color", fold: "details" },
  { field: "weightG", id: "bike-weight", fold: "details" },
  { field: "frameSerial", id: "bike-serial", fold: "details" },
  { field: "notes", id: "bike-notes", fold: "details" },
  { field: "purchasedOn", id: "bike-bought-on", fold: "purchase" },
  { field: "purchasePriceCents", id: "bike-price", fold: "purchase" },
  { field: "shop", id: "bike-shop", fold: "purchase" },
  { field: "initialDistanceM", id: "bike-initial-km", fold: "purchase" },
  { field: "initialWearS", id: "bike-initial-hours", fold: "purchase" },
];

function BikeForm({
  bike,
  focus,
  shops,
  today,
  onSubmit,
}: {
  bike: BikeFormVM | null;
  focus?: "status";
  shops: ShopOption[];
  today: LocalDate;
  onSubmit: (input: BikeInput) => Promise<SaveBikeResult>;
}) {
  const [values, setValues] = React.useState(() => initialValues(bike, today));
  const [errors, setErrors] = React.useState<Errors>({});
  const [folds, setFolds] = React.useState({ details: false, purchase: false });
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const shopIsNew =
    values.shopName.trim() !== "" &&
    !shops.some((shop) => nameKey(shop.name) === nameKey(values.shopName));

  function showErrors(next: Errors) {
    setErrors(next);
    const first = FIELD_ORDER.find(({ field }) => next[field]);
    if (!first) return;
    if (first.fold) setFolds((f) => ({ ...f, [first.fold!]: true }));
    // After the fold has opened.
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>(`#${first.id}`)?.focus(),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const converted = toInput(values, shops);
    if (converted.errors) {
      showErrors(converted.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const result = await onSubmit(converted.input);
      if (!result.ok) showErrors({ ...result.fieldErrors, form: result.error });
    } catch {
      setErrors({ form: "Enregistrement impossible. Vérifie la connexion et réessaie." });
    } finally {
      setPending(false);
    }
  }

  const StatusIcon = BIKE_STATUS_ICONS[values.status];

  return (
    <SheetForm ref={formRef} onSubmit={submit}>
      <SheetBody>
        {errors.form ? <FieldError>{errors.form}</FieldError> : null}
        <Field label="Nom" id="bike-name" error={errors.name}>
          <Input
            autoComplete="off"
            maxLength={60}
            placeholder="Ex. Spectral, Le Lourd"
            value={values.name}
            data-autofocus={focus === "status" ? undefined : ""}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Marque" id="bike-brand" error={errors.brand}>
            <Input
              autoComplete="off"
              maxLength={60}
              value={values.brand}
              onChange={(e) => set("brand", e.target.value)}
            />
          </Field>
          <Field label="Modèle" id="bike-model" error={errors.model}>
            <Input
              autoComplete="off"
              maxLength={80}
              value={values.model}
              onChange={(e) => set("model", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Année" id="bike-year" error={errors.modelYear}>
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="off"
              value={values.modelYear}
              onChange={(e) => set("modelYear", e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Discipline" id="bike-discipline" error={errors.discipline}>
            <NativeSelect
              value={values.discipline}
              onChange={(e) => set("discipline", e.target.value as Discipline | "")}
            >
              {values.discipline ? null : <option value="">Choisis…</option>}
              {DISCIPLINE_ORDER.map((discipline) => (
                <option key={discipline} value={discipline}>
                  {DISCIPLINE_LABELS[discipline]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Fieldset legend="Assistance électrique">
          <ChipRow>
            <Chip
              name="isElectric"
              value="no"
              checked={!values.isElectric}
              onChange={() => set("isElectric", false)}
            >
              Non
            </Chip>
            <Chip
              name="isElectric"
              value="yes"
              checked={values.isElectric}
              onChange={() => set("isElectric", true)}
            >
              <Zap aria-hidden />
              Oui
            </Chip>
          </ChipRow>
        </Fieldset>

        <Fieldset legend="Statut">
          <ChipRow>
            {BIKE_STATUSES.map((status) => {
              const Icon = BIKE_STATUS_ICONS[status];
              return (
                <Chip
                  key={status}
                  name="status"
                  value={status}
                  checked={values.status === status}
                  aria-describedby="bike-status-effect"
                  data-autofocus={focus === "status" && values.status === status ? "" : undefined}
                  onChange={() => set("status", status)}
                >
                  <Icon aria-hidden />
                  {BIKE_STATUS_LABELS[status]}
                </Chip>
              );
            })}
          </ChipRow>
          <p id="bike-status-effect" className="flex items-start gap-1.5 hint" aria-live="polite">
            <StatusIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {BIKE_STATUS_EFFECTS[values.status]}
          </p>
        </Fieldset>

        {values.status === "sold" ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Date de vente" id="bike-sold-on" error={errors.soldOn}>
              <Input
                type="date"
                max={today}
                value={values.soldOn}
                onChange={(e) => set("soldOn", e.target.value)}
              />
            </Field>
            <Field label="Prix de vente" id="bike-sale-price" error={errors.salePriceCents}>
              <Input
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                suffix="€"
                value={values.salePrice}
                onChange={(e) => set("salePrice", e.target.value)}
              />
            </Field>
          </div>
        ) : null}

        <Fold
          open={folds.details}
          onOpenChange={(open) => setFolds((f) => ({ ...f, details: open }))}
          title="Détails"
          hint="taille, roues, couleur, poids, numéro de cadre"
        >
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Taille" id="bike-size" error={errors.frameSize}>
              <Input
                autoComplete="off"
                maxLength={20}
                placeholder="Ex. L, 56"
                value={values.frameSize}
                onChange={(e) => set("frameSize", e.target.value)}
              />
            </Field>
            <Field label="Roues" id="bike-wheels" error={errors.wheelSize}>
              <NativeSelect
                value={values.wheelSize}
                onChange={(e) => set("wheelSize", e.target.value as WheelSize | "")}
              >
                <option value="">Non renseigné</option>
                {WHEEL_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {WHEEL_SIZE_LABELS[size]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Couleur" id="bike-color" error={errors.color}>
              <Input
                autoComplete="off"
                maxLength={60}
                value={values.color}
                onChange={(e) => set("color", e.target.value)}
              />
            </Field>
            <Field label="Poids" id="bike-weight" error={errors.weightG}>
              <Input
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,0"
                suffix="kg"
                value={values.weightKg}
                onChange={(e) => set("weightKg", e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Numéro de cadre"
            id="bike-serial"
            hint="Masqué dans la fiche, affiché à la demande."
            error={errors.frameSerial}
          >
            <Input
              autoComplete="off"
              spellCheck={false}
              maxLength={60}
              value={values.frameSerial}
              onChange={(e) => set("frameSerial", e.target.value)}
            />
          </Field>
          <Field label="Notes" id="bike-notes" error={errors.notes}>
            <Textarea
              placeholder="Particularités, options…"
              maxLength={2000}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </Fold>

        <Fold
          open={folds.purchase}
          onOpenChange={(open) => setFolds((f) => ({ ...f, purchase: open }))}
          title="Achat"
          hint="date, prix, boutique, neuf ou occasion"
        >
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Date d'achat" id="bike-bought-on" error={errors.purchasedOn}>
              <Input
                type="date"
                max={today}
                value={values.purchasedOn}
                onChange={(e) => set("purchasedOn", e.target.value)}
              />
            </Field>
            <Field label="Prix d'achat" id="bike-price" error={errors.purchasePriceCents}>
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
          <Field
            label="Boutique"
            id="bike-shop"
            hint={shops.length ? "Tes boutiques sont proposées pendant la saisie." : undefined}
            error={errors.shop}
          >
            <Input
              autoComplete="off"
              maxLength={100}
              list="bike-shop-options"
              value={values.shopName}
              onChange={(e) => set("shopName", e.target.value)}
            />
          </Field>
          <datalist id="bike-shop-options">
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
          <Fieldset legend="État à l'achat">
            <ChipRow>
              <Chip
                name="boughtUsed"
                value="new"
                checked={!values.boughtUsed}
                onChange={() => set("boughtUsed", false)}
              >
                Neuf
              </Chip>
              <Chip
                name="boughtUsed"
                value="used"
                checked={values.boughtUsed}
                onChange={() => set("boughtUsed", true)}
              >
                Occasion
              </Chip>
            </ChipRow>
          </Fieldset>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Distance à l'achat" id="bike-initial-km" error={errors.initialDistanceM}>
              <Input
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                suffix="km"
                value={values.initialKm}
                onChange={(e) => set("initialKm", e.target.value)}
              />
            </Field>
            <Field label="Heures à l'achat" id="bike-initial-hours" error={errors.initialWearS}>
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
          <p className="-mt-2 hint">
            Ce que le vélo avait déjà roulé avant d&apos;être suivi ici (occasion, historique non
            saisi).
          </p>
        </Fold>
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Check />
          {bike ? "Enregistrer" : "Ajouter le vélo"}
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}
