"use client";

import { useToast } from "@/components/ui/toast";
import { setTaskDoneAction } from "@/server/actions/tasks";

/** "Fait" on a task, with "Annuler" reopening it (D-60). */
export function useTaskDone() {
  const toast = useToast();
  return async (taskId: number, title: string) => {
    const result = await setTaskDoneAction(taskId, true);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    toast(`Tâche faite : ${title}`, {
      undo: async () => toast((await setTaskDoneAction(taskId, false)).message),
    });
  };
}
