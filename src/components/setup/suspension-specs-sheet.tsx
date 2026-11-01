"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { SETUP_UNIT_LABELS } from "@/lib/labels";
import type { SaveSetupResult, SuspensionSpecsInput, SuspensionUnitVM } from "@/lib/view-models";
import {
  SuspensionSpecsFields,
  firstSuspensionErrorId,
  readSuspensionForm,
  suspensionFormValues,
  type SuspensionFormErrors,
} from "./suspension-specs-fields";

/*
 * "Débattement et molettes" (D-83): what a fork or rear shock is, edited from the setup tab
 * rather than from its component sheet. Spring, travel (a shock's stroke) and the number of clicks
 * of each adjuster, from closed to fully open.
 */
export function SuspensionSpecsSheet({
  open,
  onOpenChange,
  unit,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: SuspensionUnitVM | null;
  onSubmit: (componentId: number, specs: SuspensionSpecsInput) => Promise<SaveSetupResult>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Débattement et molettes"
        description={unit ? `${SETUP_UNIT_LABELS[unit.typeCode]} · ${unit.name}` : undefined}
      >
        {open && unit ? (
          <SpecsForm
            key={unit.componentId}
            unit={unit}
            onSubmit={async (specs) => {
              const result = await onSubmit(unit.componentId, specs);
              if (result.ok) onOpenChange(false);
              return result;
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SpecsForm({
  unit,
  onSubmit,
}: {
  unit: SuspensionUnitVM;
  onSubmit: (specs: SuspensionSpecsInput) => Promise<SaveSetupResult>;
}) {
  const [values, setValues] = React.useState(() => suspensionFormValues(unit.specs, true));
  const [errors, setErrors] = React.useState<SuspensionFormErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const read = readSuspensionForm(unit.typeCode, { ...values, suspended: true });
    setErrors(read.errors);
    const firstError = firstSuspensionErrorId(read.errors);
    if (firstError || !read.specs) {
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>(`#${firstError}`)?.focus(),
      );
      return;
    }
    setFormError(null);
    setPending(true);
    try {
      const result = await onSubmit(read.specs);
      if (!result.ok) setFormError(result.error ?? "Enregistrement impossible.");
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
        <SuspensionSpecsFields
          standalone
          typeCode={unit.typeCode}
          values={values}
          onChange={setValues}
          errors={errors}
        />
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Check />
          Enregistrer
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}
