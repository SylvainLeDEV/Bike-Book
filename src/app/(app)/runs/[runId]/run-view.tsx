"use client";

import { useRouter } from "next/navigation";
import { RunScreen, type RunActions } from "@/components/runs/run-screen";
import { useToast } from "@/components/ui/toast";
import type { RunVM } from "@/lib/view-models";
import { replacePartAction, undoReplacePartAction } from "@/server/actions/components";
import {
  abandonRunAction,
  addRunStepAction,
  finishRunAction,
  removeRunStepAction,
  undoFinishRunAction,
  updateRunStepAction,
} from "@/server/actions/runs";

export function RunView({ vm }: { vm: RunVM }) {
  const toast = useToast();
  const router = useRouter();
  // "Quitter" and the end of the run lead back to the bike, else to "À prévoir".
  const home = vm.bike ? `/bikes/${vm.bike.id}` : "/";

  const actions: RunActions = {
    onStep: async (stepId, patch) => {
      const result = await updateRunStepAction(stepId, patch);
      return result.ok ? null : result.error;
    },
    onAddStep: async (instruction) => {
      const result = await addRunStepAction(vm.id, instruction);
      return result.ok ? { stepId: result.stepId } : { error: result.error };
    },
    onRemoveStep: async (stepId) => {
      const result = await removeRunStepAction(stepId);
      return result.ok ? null : result.error;
    },
    onAbandon: async () => {
      const result = await abandonRunAction(vm.id);
      if (!result.ok) return result.error;
      toast(result.message);
      router.push(home);
      return null;
    },
    onFinish: async (input) => {
      const result = await finishRunAction(vm.id, input);
      if (!result.ok) return result.error;
      const undo = result.undo;
      toast(result.message, {
        undo: async () => toast((await undoFinishRunAction(undo)).message),
      });
      router.push(result.bikeId != null ? `/bikes/${result.bikeId}?tab=history` : "/");
      return null;
    },
    onReplace: async (input) => {
      const result = await replacePartAction(input);
      if (!result.ok) return result;
      toast(result.message, {
        undo: async () => toast((await undoReplacePartAction(result.undoItemId)).message),
      });
      return { ok: true, eventId: result.eventId ?? null };
    },
  };

  return <RunScreen vm={vm} actions={actions} quitHref={home} />;
}
