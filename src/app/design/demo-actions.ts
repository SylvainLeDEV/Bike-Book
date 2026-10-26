"use client";

import * as React from "react";
import type { PlanActions } from "@/components/plan/plan-list";
import { useToast } from "@/components/ui/toast";
import type { TaskRowVM } from "@/lib/view-models";

/**
 * What the "À prévoir" buttons do on /design: a toast with "Annuler", and tasks really leave
 * the list. The real undo mechanism comes with the first feature that writes (step B).
 */
export function useDemoPlanActions(initialTasks: TaskRowVM[]) {
  const toast = useToast();
  const [doneIds, setDoneIds] = React.useState<number[]>([]);
  const tasks = initialTasks.filter((task) => !doneIds.includes(task.id));
  const actions: PlanActions = {
    onRuleDone: (rule) =>
      toast(`Entretien noté : ${rule.title}`, { undo: () => toast("Entretien retiré") }),
    onRuleSnooze: (rule) =>
      toast(`Rappel reporté de 2 semaines : ${rule.title}`, {
        undo: () => toast("Report annulé"),
      }),
    onTaskDone: (task) => {
      setDoneIds((ids) => [...ids, task.id]);
      toast(`Tâche faite : ${task.title}`, {
        undo: () => {
          setDoneIds((ids) => ids.filter((id) => id !== task.id));
          toast("Tâche rouverte");
        },
      });
    },
  };
  return { tasks, actions };
}
