"use client";

import * as React from "react";
import { Check, RotateCcw } from "lucide-react";
import { AttachmentsBlock, AttachmentsLater } from "@/components/attachments/attachments-block";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { formatDate } from "@/lib/format";
import type { BikeRef, TaskInput, TaskRowVM } from "@/lib/view-models";

/*
 * "Nouvelle tâche" (feature 7, D-34): a one-off to-do, for a bike or general, with an optional
 * due date. Opened from "Ajouter une tâche" anywhere through useTaskSheet(). "Modifier la tâche"
 * (feature 10) reopens it filled, with the task's attachments (a photo of the problem, a quote).
 * A done task, opened from the history, also offers "Rouvrir la tâche" (D-77).
 */

type TaskSheetContextValue = {
  open: (bikeId?: number | null) => void;
  edit: (task: TaskRowVM) => void;
};
const TaskSheetContext = React.createContext<TaskSheetContextValue | null>(null);

export function useTaskSheet(): TaskSheetContextValue {
  const value = React.useContext(TaskSheetContext);
  if (!value) throw new Error("useTaskSheet must be used inside <TaskSheetProvider>");
  return value;
}

export function TaskSheetProvider({
  bikes,
  onSubmit,
  onUpdate,
  onReopen,
  children,
}: {
  bikes: BikeRef[];
  /** Resolves with an error message, or null once saved. */
  onSubmit: (input: TaskInput) => Promise<string | null>;
  onUpdate?: (taskId: number, input: TaskInput) => Promise<string | null>;
  /** "Rouvrir la tâche" on a done task: back to open. Resolves like `onSubmit`. */
  onReopen?: (task: TaskRowVM) => Promise<string | null>;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState({
    open: false,
    bikeId: null as number | null,
    task: null as TaskRowVM | null,
    key: 0,
  });
  const open = React.useCallback(
    (bikeId: number | null = null) =>
      setState((s) => ({ open: true, bikeId, task: null, key: s.key + 1 })),
    [],
  );
  const edit = React.useCallback(
    (task: TaskRowVM) =>
      setState((s) => ({ open: true, bikeId: task.bike?.id ?? null, task, key: s.key + 1 })),
    [],
  );
  const value = React.useMemo(() => ({ open, edit }), [open, edit]);
  const task = state.task;
  return (
    <TaskSheetContext.Provider value={value}>
      {children}
      <Sheet open={state.open} onOpenChange={(isOpen) => setState((s) => ({ ...s, open: isOpen }))}>
        <SheetContent
          title={task ? "Modifier la tâche" : "Nouvelle tâche"}
          description={
            task?.doneOn
              ? `Faite le ${formatDate(task.doneOn)}.`
              : "Une chose à faire une fois, avec ou sans échéance."
          }
        >
          <TaskForm
            key={state.key}
            bikes={bikes}
            initialBikeId={state.bikeId}
            task={task}
            onSubmit={async (input) => {
              const error =
                task && onUpdate ? await onUpdate(task.id, input) : await onSubmit(input);
              if (!error) setState((s) => ({ ...s, open: false }));
              return error;
            }}
            onReopen={
              task?.doneOn && onReopen
                ? async () => {
                    const error = await onReopen(task);
                    if (!error) setState((s) => ({ ...s, open: false }));
                    return error;
                  }
                : undefined
            }
          />
        </SheetContent>
      </Sheet>
    </TaskSheetContext.Provider>
  );
}

function TaskForm({
  bikes,
  initialBikeId,
  task,
  onSubmit,
  onReopen,
}: {
  bikes: BikeRef[];
  initialBikeId: number | null;
  /** Edit mode: the task as "À prévoir" shows it. */
  task: TaskRowVM | null;
  onSubmit: (input: TaskInput) => Promise<string | null>;
  onReopen?: () => Promise<string | null>;
}) {
  const [title, setTitle] = React.useState(task?.title ?? "");
  const [bikeId, setBikeId] = React.useState(initialBikeId == null ? "" : String(initialBikeId));
  const [dueOn, setDueOn] = React.useState(task?.dueOn ?? "");
  const [notes, setNotes] = React.useState(task?.notes ?? "");
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
        {task ? <AttachmentsBlock owner={{ kind: "task", id: task.id }} /> : <AttachmentsLater />}
      </SheetBody>
      <SheetFooter className="grid gap-2">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Check />
          {task ? "Enregistrer la tâche" : "Ajouter la tâche"}
        </Button>
        {onReopen ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={pending}
            onClick={async () => {
              setError(null);
              setPending(true);
              try {
                setError(await onReopen());
              } catch {
                setError("Enregistrement impossible. Vérifie la connexion et réessaie.");
              } finally {
                setPending(false);
              }
            }}
          >
            <RotateCcw />
            Rouvrir la tâche
          </Button>
        ) : null}
      </SheetFooter>
    </SheetForm>
  );
}
