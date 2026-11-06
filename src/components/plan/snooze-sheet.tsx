"use client";

import * as React from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, Fieldset, Input } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { addDays, addMonths, isLocalDate, NBSP, type LocalDate } from "@/lib/format";
import type { RuleRowVM } from "@/lib/view-models";

/*
 * "Reporter" a due rule until a day (D-105): shortcuts, or any day after today. A rule already
 * snoozed opens on its day ("Changer la date"). Until then it leaves the dashboard; the bike page
 * keeps it, marked "Reporté".
 */

/** The server refuses more than ten years ahead (`SNOOZE_MAX_DAYS`). */
const MAX_DAYS = 3650;

export function SnoozeSheet({
  open,
  onOpenChange,
  rule,
  today,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RuleRowVM | null;
  today: LocalDate;
  /** Resolves with an error message, or null once snoozed. */
  onSubmit: (until: LocalDate) => Promise<string | null>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={rule ? `Reporter «${NBSP}${rule.title}${NBSP}»` : "Reporter"}
        description={
          rule ? `${rule.slot?.typeLabel ?? "Vélo entier"} · ${rule.bike.name}` : undefined
        }
      >
        {open && rule ? (
          <SnoozeForm key={rule.id} rule={rule} today={today} onSubmit={onSubmit} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SnoozeForm({
  rule,
  today,
  onSubmit,
}: {
  rule: RuleRowVM;
  today: LocalDate;
  onSubmit: (until: LocalDate) => Promise<string | null>;
}) {
  const choices = [
    { label: "2 semaines", until: addDays(today, 14) },
    { label: "1 mois", until: addMonths(today, 1) },
    { label: "3 mois", until: addMonths(today, 3) },
  ];
  const [until, setUntil] = React.useState<string>(rule.snoozeEndsOn ?? choices[0].until);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const tomorrow = addDays(today, 1);
  const picked = choices.find((choice) => choice.until === until);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLocalDate(until)) {
      setError("Choisis une date.");
      return;
    }
    if (until <= today) {
      setError("Choisis un jour après aujourd'hui.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      setError(await onSubmit(until));
    } catch {
      setError("Enregistrement impossible. Vérifie la connexion et réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SheetForm onSubmit={submit}>
      <SheetBody>
        <Fieldset legend="Reporter de">
          <ChipRow>
            {choices.map((choice) => (
              <Chip
                key={choice.label}
                name="snooze-choice"
                value={choice.until}
                checked={picked === choice}
                data-autofocus={picked === choice ? "" : undefined}
                onChange={() => {
                  setUntil(choice.until);
                  setError(null);
                }}
              >
                {choice.label}
              </Chip>
            ))}
          </ChipRow>
        </Fieldset>
        <Field
          label="Jusqu'au"
          error={error}
          hint="D'ici là, le rappel n'apparaît plus sur l'accueil ; il reste sur la page du vélo."
        >
          <Input
            type="date"
            required
            min={tomorrow}
            max={addDays(today, MAX_DAYS)}
            value={until}
            data-autofocus={picked ? undefined : ""}
            onChange={(e) => {
              setUntil(e.target.value);
              setError(null);
            }}
          />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <CalendarClock />
          Reporter
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}
