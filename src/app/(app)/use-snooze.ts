"use client";

import { useToast } from "@/components/ui/toast";

type SnoozeAction = (
  ruleId: number,
) => Promise<
  { ok: true; message: string; previous: string | null } | { ok: false; message: string }
>;
type UndoAction = (ruleId: number, previous: string | null) => Promise<{ message: string }>;

/** "Reporter" on a rule, with "Annuler" restoring the previous snooze (D-60). */
export function useSnooze(snooze: SnoozeAction, undo: UndoAction) {
  const toast = useToast();
  return async (ruleId: number, title: string) => {
    const result = await snooze(ruleId);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    toast(`${result.message} : ${title}`, {
      undo: async () => toast((await undo(ruleId, result.previous)).message),
    });
  };
}
