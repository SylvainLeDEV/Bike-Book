import "server-only";
import { localDateOf } from "@/lib/format";
import type { BikeRef, TaskRowVM } from "@/lib/view-models";
import type { Bike, Task } from "@/server/db";

/**
 * A bike as lists and pastilles name it: its cover photo (D-75), else one of the placeholder art
 * palettes.
 */
export function bikeRef(
  bike: Pick<Bike, "id" | "name"> & { coverAttachmentId?: number | null },
): BikeRef {
  const cover = bike.coverAttachmentId ?? null;
  return {
    id: bike.id,
    name: bike.name,
    cover: {
      photoUrl: cover == null ? null : `/api/uploads/${cover}?size=display`,
      thumbUrl: cover == null ? null : `/api/uploads/${cover}?size=thumb`,
      artIndex: bike.id - 1,
    },
  };
}

/** A task as "À prévoir" and "Modifier la tâche" show it; `doneOn` for a done one (D-77). */
export function taskRow(
  task: Task,
  bikes: (Pick<Bike, "id" | "name"> & { coverAttachmentId?: number | null })[],
  timeZone: string,
): TaskRowVM {
  const bike = bikes.find((b) => b.id === task.bikeId);
  return {
    id: task.id,
    bike: bike ? bikeRef(bike) : null,
    title: task.title,
    dueOn: task.dueOn,
    notes: task.notes,
    doneOn: task.doneAt == null ? null : localDateOf(task.doneAt, timeZone),
  };
}
