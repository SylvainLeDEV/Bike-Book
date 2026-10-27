"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import type { BikeRef, TaskInput } from "@/lib/view-models";

/*
 * "Nouvelle tâche" (feature 7, D-34): a one-off to-do, for a bike or general, with an optional
 * due date. Opened from "Ajouter une tâche" anywhere through useTaskSheet().
 */

type TaskSheetContextValue = { open: (bikeId?: number | null) => void };
const TaskSheetContext = React.createContext<TaskSheetContextValue | null>(null);

export function useTaskSheet(): TaskSheetContextValue {
  const value = React.useContext(TaskSheetContext);
  if (!value) throw new Error("useTaskSheet must be used inside <TaskSheetProvider>");
  return value;
}

export function TaskSheetProvider({
  bikes,
  onSubmit,
  children,
}: {
  bikes: BikeRef[];
  /** Resolves with an error message, or null once saved. */
  onSubmit: (input: TaskInput) => Promise<string | null>;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState({ open: false, bikeId: null as number | null, key: 0 });
  const open = React.useCallback(
    (bikeId: number | null = null) => setState((s) => ({ open: true, bikeId, key: s.key + 1 })),
    [],
  );
  const value = React.useMemo(() => ({ open }), [open]);
  return (
    <TaskSheetContext.Provider value={value}>
      {children}
      <Sheet open={state.open} onOpenChange={(isOpen) => setState((s) => ({ ...s, open: isOpen }))}>
        <SheetContent
          title="Nouvelle tâche"
          description="Une chose à faire une fois, avec ou sans échéance."
        >
          <TaskForm
            key={state.key}
            bikes={bikes}
            initialBikeId={state.bikeId}
            onSubmit={async (input) => {
              const error = await onSubmit(input);
              if (!error) setState((s) => ({ ...s, open: false }));
              return error;
            }}
          />
        </SheetContent>
      </Sheet>
    </TaskSheetContext.Provider>
  );
}

function TaskForm({
  bikes,
  initialBikeId,
  onSubmit,
}: {
  bikes: BikeRef[];
  initialBikeId: number | null;
  onSubmit: (input: TaskInput) => Promise<string | null>;
}) {
  const [title, setTitle] = React.useState("");
  const [bikeId, setBikeId] = React.useState(initialBikeId == null ? "" : String(initialBikeId));
  const [dueOn, setDueOn] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [titleError, setTitleError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError("Donne un titre à la tâche.");
      return;
    }
    setTitleError(null);
    setError(null);
    setPending(true);
    try {
      setError(
        await onSubmit({
          bikeId: bikeId ? Number(bikeId) : null,
          title: title.trim(),
          dueOn: dueOn || null,
          notes: notes.trim() || null,
        }),
      );
    } catch {
      setError("Enregistrement impossible. Vérifie la connexion et réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SheetForm onSubmit={submit}>
      <SheetBody>
        {error ? <FieldError>{error}</FieldError> : null}
        <Field label="Tâche" error={titleError}>
          <Input
            autoComplete="off"
            maxLength={120}
            placeholder="Ex. Vérifier le serrage des pivots"
            value={title}
            data-autofocus=""
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Vélo">
            <NativeSelect value={bikeId} onChange={(e) => setBikeId(e.target.value)}>
              <option value="">Général</option>
              {bikes.map((bike) => (
                <option key={bike.id} value={bike.id}>
                  {bike.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Échéance" hint="Facultative.">
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Check />
          Ajouter la tâche
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}
