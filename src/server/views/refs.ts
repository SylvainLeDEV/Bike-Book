import "server-only";
import { localDateOf } from "@/lib/format";
import { photoFrame } from "@/lib/framing";
import type { BikeRef, TaskRowVM } from "@/lib/view-models";
import type { Bike, Procedure, Run, Task } from "@/server/db";

/**
 * A bike as lists and pastilles name it: its cover photo (D-75), else one of the placeholder art
 * palettes.
 */
export function bikeRef(bike: BikeRefSource): BikeRef {
  const cover = bike.coverAttachmentId ?? null;
  return {
    id: bike.id,
    name: bike.name,
    cover: {
      photoUrl: cover == null ? null : `/api/uploads/${cover}?size=display`,
      thumbUrl: cover == null ? null : `/api/uploads/${cover}?size=thumb`,
      artIndex: bike.id - 1,
      attachmentId: cover,
      frame: cover == null ? null : photoFrame(bike.coverPhoto),
    },
  };
}

/** What `bikeRef` reads: a bike, with its cover and the cover's framing (D-103) when it has one. */
export type BikeRefSource = Pick<Bike, "id" | "name"> &
  Partial<Pick<Bike, "coverAttachmentId" | "coverPhoto">>;

/**
 * A task as "À prévoir" and "Modifier la tâche" show it; `doneOn` for a done one (D-77), the
 * procedure it is done with when `procedures` names it (D-86), its run (D-87): in progress for
 * an open task, the one it was done with for a done task.
 */
export function taskRow(
  task: Task,
  bikes: BikeRefSource[],
  timeZone: string,
  procedures: Pick<Procedure, "id" | "title">[] = [],
  runs: Pick<Run, "id" | "taskId" | "status">[] = [],
): TaskRowVM {
  const bike = bikes.find((b) => b.id === task.bikeId);
  const procedure = procedures.find((p) => p.id === task.procedureId);
  const run = runs.find(
    (r) => r.taskId === task.id && r.status === (task.status === "done" ? "done" : "in_progress"),
  );
  return {
    id: task.id,
    bike: bike ? bikeRef(bike) : null,
    title: task.title,
    dueOn: task.dueOn,
    notes: task.notes,
    doneOn: task.doneAt == null ? null : localDateOf(task.doneAt, timeZone),
    procedure: procedure ? { id: procedure.id, title: procedure.title } : null,
    run: run ? { id: run.id, status: run.status } : null,
  };
}
