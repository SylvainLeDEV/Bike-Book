"use client";

import * as React from "react";
import { CableCar, Calendar, Check, ChevronRight } from "lucide-react";
import { BikeCover } from "@/components/bike-cover";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, FieldError, Fieldset, Input, Textarea } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { addDays } from "@/lib/format";
import { CONDITIONS_LABELS, RIDE_TYPE_LABELS, RIDE_TYPE_ORDER } from "@/lib/labels";
import type { QuickRideInput, QuickRideVM, RideConditions, RideType } from "@/lib/view-models";

/*
 * Quick ride entry (principle 1: under 30 seconds). Required: bike, date, one duration. The
 * defaults do most of the work: last bike used, today, the ride type most used with that bike.
 * "Bike park" swaps the duration for total time, descent time and runs (D-06, D-13).
 */

type QuickRideContextValue = { open: (bikeId?: number) => void };
const QuickRideContext = React.createContext<QuickRideContextValue | null>(null);

export function useQuickRide(): QuickRideContextValue {
  const value = React.useContext(QuickRideContext);
  if (!value) throw new Error("useQuickRide must be used inside <QuickRideProvider>");
  return value;
}

export function QuickRideProvider({
  vm,
  onSubmit,
  children,
}: {
  vm: QuickRideVM;
  /** Saves the ride; the caller shows the toast. An `{ ok: false }` answer keeps the sheet open. */
  onSubmit: (input: QuickRideInput) => void | Promise<void | { ok: false; error: string }>;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<{ open: boolean; bikeId: number | null; key: number }>({
    open: false,
    bikeId: null,
    key: 0,
  });
  const open = React.useCallback(
    (bikeId?: number) => setState((s) => ({ open: true, bikeId: bikeId ?? null, key: s.key + 1 })),
    [],
  );
  const value = React.useMemo(() => ({ open }), [open]);
  return (
    <QuickRideContext.Provider value={value}>
      {children}
      <Sheet open={state.open} onOpenChange={(isOpen) => setState((s) => ({ ...s, open: isOpen }))}>
        <SheetContent
          title="Nouvelle sortie"
          description="Obligatoire : le vélo, la date et une durée."
        >
          <QuickRideForm
            key={state.key}
            vm={vm}
            initialBikeId={state.bikeId ?? vm.defaultBikeId ?? vm.bikes[0]?.id ?? null}
            onDone={async (input) => {
              const result = await onSubmit(input);
              if (result && !result.ok) return result.error;
              setState((s) => ({ ...s, open: false }));
              return null;
            }}
          />
        </SheetContent>
      </Sheet>
    </QuickRideContext.Provider>
  );
}

type When = "today" | "yesterday" | "other";
type Errors = Partial<Record<"duration" | "total" | "descent", string>>;

/** Hours and minutes typed in two boxes; null when both are empty. */
function toSeconds(hours: string, minutes: string): number | null {
  if (!hours.trim() && !minutes.trim()) return null;
  const h = Number.parseInt(hours || "0", 10);
  const m = Number.parseInt(minutes || "0", 10);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || m > 59) return Number.NaN;
  return (h * 60 + m) * 60;
}

function parseDecimal(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number.parseFloat(value.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function DurationInputs({
  idPrefix,
  label,
  errorId,
  invalid,
  hours,
  minutes,
  onHours,
  onMinutes,
}: {
  idPrefix: string;
  label: string;
  errorId?: string;
  invalid: boolean;
  hours: string;
  minutes: string;
  onHours: (value: string) => void;
  onMinutes: (value: string) => void;
}) {
  const common = {
    inputMode: "numeric" as const,
    pattern: "[0-9]*",
    autoComplete: "off",
    maxLength: 2,
    "aria-describedby": errorId,
    "aria-invalid": invalid || undefined,
  };
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Input
        {...common}
        id={`${idPrefix}-h`}
        aria-label={`${label}, heures`}
        suffix="h"
        value={hours}
        onChange={(e) => onHours(e.target.value.replace(/\D/g, ""))}
      />
      <Input
        {...common}
        id={`${idPrefix}-min`}
        aria-label={`${label}, minutes`}
        suffix="min"
        value={minutes}
        onChange={(e) => onMinutes(e.target.value.replace(/\D/g, ""))}
      />
    </div>
  );
}

function QuickRideForm({
  vm,
  initialBikeId,
  onDone,
}: {
  vm: QuickRideVM;
  initialBikeId: number | null;
  /** Resolves with the server's error message, or null once saved. */
  onDone: (input: QuickRideInput) => Promise<string | null>;
}) {
  const usualType = (id: number | null) =>
    vm.bikes.find((bike) => bike.id === id)?.usualRideType ?? "trail";
  const [bikeId, setBikeId] = React.useState(initialBikeId);
  const [when, setWhen] = React.useState<When>("today");
  const [otherDate, setOtherDate] = React.useState(addDays(vm.today, -2));
  const [rideType, setRideType] = React.useState<RideType>(usualType(initialBikeId));
  const [duration, setDuration] = React.useState({ h: "", m: "" });
  const [total, setTotal] = React.useState({ h: "", m: "" });
  const [descent, setDescent] = React.useState({ h: "", m: "" });
  const [runs, setRuns] = React.useState("");
  const [distance, setDistance] = React.useState("");
  const [elevation, setElevation] = React.useState("");
  const [conditions, setConditions] = React.useState<RideConditions | null>(null);
  const [location, setLocation] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Errors>({});
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const park = rideType === "bike_park";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bikeId == null) return;
    const next: Errors = {};
    const durationS = park ? null : toSeconds(duration.h, duration.m);
    const totalS = park ? toSeconds(total.h, total.m) : null;
    const descentS = park ? toSeconds(descent.h, descent.m) : null;
    if (!park && (durationS == null || !(durationS > 0)))
      next.duration = "Indique une durée, même approximative.";
    if (park && (totalS == null || !(totalS > 0)))
      next.total = "Indique le temps total de la journée.";
    if (park && descentS != null && (Number.isNaN(descentS) || (totalS && descentS > totalS)))
      next.descent = "Le temps de descente ne peut pas dépasser le temps total.";
    setErrors(next);
    if (Object.keys(next).length) {
      const first = next.duration ? "qr-duration-h" : next.total ? "qr-total-h" : "qr-descent-h";
      formRef.current?.querySelector<HTMLInputElement>(`#${first}`)?.focus();
      return;
    }
    const km = parseDecimal(distance);
    const elevationM = parseDecimal(elevation);
    const runsCount = Number.parseInt(runs, 10);
    setPending(true);
    setFormError(null);
    try {
      const error = await onDone({
        bikeId,
        on: when === "today" ? vm.today : when === "yesterday" ? addDays(vm.today, -1) : otherDate,
        rideType,
        durationS,
        totalTimeS: totalS,
        descentTimeS: descentS,
        runsCount: park && Number.isFinite(runsCount) ? runsCount : null,
        distanceM: km == null ? null : Math.round(km * 1000),
        elevationGainM: elevationM == null ? null : Math.round(elevationM),
        conditions,
        location: location.trim() || null,
        notes: notes.trim() || null,
        startTime: startTime || null,
      });
      setFormError(error);
    } catch {
      setFormError("Enregistrement impossible. Vérifie la connexion et réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SheetForm ref={formRef} onSubmit={submit}>
      <SheetBody>
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Fieldset legend="Vélo">
          <ChipRow scroll className="-mx-5 px-5">
            {vm.bikes.map((bike) => (
              <Chip
                key={bike.id}
                name="bike"
                value={bike.id}
                checked={bikeId === bike.id}
                data-autofocus={bikeId === bike.id ? "" : undefined}
                onChange={() => {
                  setBikeId(bike.id);
                  setRideType(bike.usualRideType);
                }}
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

        <Fieldset legend="Date">
          <ChipRow>
            <Chip
              name="when"
              value="today"
              checked={when === "today"}
              onChange={() => setWhen("today")}
            >
              Aujourd&apos;hui
            </Chip>
            <Chip
              name="when"
              value="yesterday"
              checked={when === "yesterday"}
              onChange={() => setWhen("yesterday")}
            >
              Hier
            </Chip>
            <Chip
              name="when"
              value="other"
              checked={when === "other"}
              onChange={() => setWhen("other")}
            >
              <Calendar aria-hidden />
              Autre date
            </Chip>
          </ChipRow>
          {when === "other" ? (
            <Field label="Date de la sortie">
              <Input
                type="date"
                value={otherDate}
                max={vm.today}
                onChange={(e) => setOtherDate(e.target.value)}
              />
            </Field>
          ) : null}
        </Fieldset>

        <Fieldset legend="Type" hint="proposé d'après tes sorties avec ce vélo">
          <ChipRow scroll className="-mx-5 px-5">
            {RIDE_TYPE_ORDER.map((type) => (
              <Chip
                key={type}
                name="rideType"
                value={type}
                checked={rideType === type}
                onChange={() => setRideType(type)}
              >
                {type === "bike_park" ? <CableCar aria-hidden /> : null}
                {RIDE_TYPE_LABELS[type]}
              </Chip>
            ))}
          </ChipRow>
        </Fieldset>

        {park ? (
          <div className="grid gap-3 rounded-card bg-brand-soft p-3.5">
            <p className="flex items-start gap-2.5 text-[13.5px] leading-[1.45] text-brand-ink">
              <CableCar className="mt-px size-5 shrink-0" aria-hidden />
              Avec remontées mécaniques, seul le temps de descente use le vélo ; s&apos;il manque,
              l&apos;usure compte le temps en mouvement, sinon le temps total.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Fieldset
                legend="Temps total"
                legendClassName="mb-0"
                error={errors.total}
                errorId="qr-total-error"
              >
                <DurationInputs
                  idPrefix="qr-total"
                  label="Temps total"
                  errorId={errors.total ? "qr-total-error" : undefined}
                  invalid={Boolean(errors.total)}
                  hours={total.h}
                  minutes={total.m}
                  onHours={(h) => setTotal((t) => ({ ...t, h }))}
                  onMinutes={(m) => setTotal((t) => ({ ...t, m }))}
                />
              </Fieldset>
              <Fieldset
                legend="Temps de descente"
                legendClassName="mb-0"
                error={errors.descent}
                errorId="qr-descent-error"
              >
                <DurationInputs
                  idPrefix="qr-descent"
                  label="Temps de descente"
                  errorId={errors.descent ? "qr-descent-error" : undefined}
                  invalid={Boolean(errors.descent)}
                  hours={descent.h}
                  minutes={descent.m}
                  onHours={(h) => setDescent((t) => ({ ...t, h }))}
                  onMinutes={(m) => setDescent((t) => ({ ...t, m }))}
                />
              </Fieldset>
              <Field label="Descentes">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  autoComplete="off"
                  placeholder="0"
                  value={runs}
                  onChange={(e) => setRuns(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>
          </div>
        ) : (
          <Fieldset legend="Durée" error={errors.duration} errorId="qr-duration-error">
            <DurationInputs
              idPrefix="qr-duration"
              label="Durée"
              errorId={errors.duration ? "qr-duration-error" : undefined}
              invalid={Boolean(errors.duration)}
              hours={duration.h}
              minutes={duration.m}
              onHours={(h) => setDuration((d) => ({ ...d, h }))}
              onMinutes={(m) => setDuration((d) => ({ ...d, m }))}
            />
          </Fieldset>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Distance">
            <Input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,0"
              suffix="km"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
          </Field>
          <Field label="Dénivelé +">
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="0"
              suffix="m"
              value={elevation}
              onChange={(e) => setElevation(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>

        <Fieldset legend="Conditions" hint="facultatif, affinera l'usure plus tard">
          <ChipRow scroll className="-mx-5 px-5">
            {(Object.keys(CONDITIONS_LABELS) as RideConditions[]).map((value) => (
              <Chip
                key={value}
                name="conditions"
                value={value}
                checked={conditions === value}
                onChange={() => setConditions(value)}
                // A second tap on the chosen chip clears it: the field stays optional.
                onClick={() => conditions === value && setConditions(null)}
              >
                {CONDITIONS_LABELS[value]}
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
            Plus de détails <span className="hint">lieu, heure, notes</span>
          </summary>
          <div className="grid gap-4 pt-1.5">
            <div className="grid gap-2">
              <Field label="Lieu">
                <Input
                  autoComplete="off"
                  placeholder="Ex. Massif des Bauges"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </Field>
              {vm.recentLocations.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {vm.recentLocations.map((place) => (
                    <button
                      key={place}
                      type="button"
                      onClick={() => setLocation(place)}
                      className="h-8 rounded-full border border-dashed border-border px-3 text-[13px] text-fg-muted hover:border-fg-muted hover:text-fg pointer-coarse:h-11"
                    >
                      {place}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <Field
              label="Heure de départ"
              hint="Facultative : sans heure, la sortie compte à midi. Elle range la sortie avant ou après un remplacement fait le même jour."
            >
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="Notes">
              <Textarea
                placeholder="Réglages, sensations, incidents…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        </details>
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending || bikeId == null}>
          <Check />
          Enregistrer la sortie
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}
