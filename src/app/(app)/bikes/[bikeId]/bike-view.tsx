"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { BikeScreen } from "@/components/bike/bike-screen";
import { useBikeSheet } from "@/components/bike/bike-sheet";
import { ComponentSheet } from "@/components/bike/component-sheet";
import { WearDetailSheet } from "@/components/bike/wear-detail-sheet";
import { MaintenanceSheet } from "@/components/maintenance/maintenance-sheet";
import { RulesSheet } from "@/components/plan/rules-sheet";
import { useTaskSheet } from "@/components/plan/task-sheet";
import { useQuickRide } from "@/components/rides/quick-ride";
import { Crumb, PageBody, Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ComponentFormVM, MaintenanceEditVM, MaintenanceLineInput } from "@/lib/view-models";
import {
  replacePartAction,
  saveComponentAction,
  undoReplacePartAction,
} from "@/server/actions/components";
import {
  deleteMaintenanceAction,
  saveMaintenanceAction,
  undoMaintenanceAction,
  updateMaintenanceAction,
} from "@/server/actions/maintenance";
import { saveRuleAction, snoozeRuleAction, undoSnoozeAction } from "@/server/actions/rules";
import type { BikePage } from "@/server/views/bikes";
import { useSnooze } from "../../use-snooze";
import { useTaskDone } from "../../use-task-done";

type Prefill = { title: string; lines: MaintenanceLineInput[] } | null;

export function BikeView({
  page,
  doneRuleId,
  replaceItemId,
  editEventId,
}: {
  page: BikePage;
  doneRuleId: number | null;
  replaceItemId: number | null;
  /** ?event=<id>: an entry of Activité opens its edit sheet here (D-70). */
  editEventId: number | null;
}) {
  const bikeSheet = useBikeSheet();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const snooze = useSnooze(snoozeRuleAction, undoSnoozeAction);
  const taskSheet = useTaskSheet();
  const taskDone = useTaskDone();
  const quickRide = useQuickRide();
  const [componentSheet, setComponentSheet] = React.useState<{
    open: boolean;
    component: ComponentFormVM | null;
  }>({ open: false, component: null });
  // "C'est fait" from the dashboard lands here with ?done=<rule>: the prefilled sheet opens.
  const [maintenance, setMaintenance] = React.useState<{
    open: boolean;
    prefill: Prefill;
    edit: MaintenanceEditVM | null;
  }>(() => {
    const edit = editEventId == null ? undefined : page.edits.maintenance[editEventId];
    if (edit) return { open: true, prefill: null, edit };
    const prefill = doneRuleId == null ? undefined : page.done[doneRuleId];
    return prefill
      ? { open: true, prefill, edit: null }
      : { open: false, prefill: null, edit: null };
  });
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [wearOpen, setWearOpen] = React.useState(false);
  const edit = (focus?: "status") => bikeSheet.open({ bike: page.form, focus });
  const bikeId = page.vm.bike.id;

  // Drop ?done, ?replace and ?event from the address once used, so a reload does not reopen the sheet.
  React.useEffect(() => {
    if (doneRuleId != null || replaceItemId != null || editEventId != null) {
      router.replace(pathname, { scroll: false });
    }
  }, [doneRuleId, replaceItemId, editEventId, pathname, router]);

  return (
    <>
      <Topbar
        start={<Crumb back={{ href: "/bikes", label: "Vélos" }} current={page.vm.bike.name} />}
        actions={
          <Button variant="ghost" size="icon" aria-label="Modifier le vélo" onClick={() => edit()}>
            <Pencil />
          </Button>
        }
      />
      <PageBody>
        <BikeScreen
          // A new bike or a renamed one starts on its first tab again.
          key={bikeId}
          vm={page.vm}
          replace={page.replace}
          initialReplaceItemId={replaceItemId}
          links={{
            workshopItem: (id) => `/workshop?item=${id}`,
            workshopForBike: `/workshop?bike=${bikeId}`,
            rebuyForBike: `/workshop?tab=rebuy&bike=${bikeId}`,
          }}
          actions={{
            onEditBike: edit,
            onAddMaintenance: () => setMaintenance({ open: true, prefill: null, edit: null }),
            onRuleDone: (rule) =>
              setMaintenance({ open: true, prefill: page.done[rule.id] ?? null, edit: null }),
            onEditHistoryItem: (item) => {
              if (item.kind === "ride") {
                const ride = page.edits.rides[item.id];
                if (ride) quickRide.edit(item.id, ride);
                return;
              }
              if (item.kind === "task") {
                const task = page.edits.tasks[item.id];
                if (task) taskSheet.edit(task);
                return;
              }
              const edit = page.edits.maintenance[item.id];
              if (edit) setMaintenance({ open: true, prefill: null, edit });
            },
            onRuleSnooze: (rule) => snooze(rule.id, rule.title),
            onTaskDone: (task) => taskDone(task.id, task.title),
            onTaskEdit: (task) => taskSheet.edit(task),
            workshopItemHref: (id) => `/workshop?item=${id}`,
            onAddTask: () => taskSheet.open(bikeId),
            onShowRules: () => setRulesOpen(true),
            onShowWearDetail: () => setWearOpen(true),
            onAddComponent: () => setComponentSheet({ open: true, component: null }),
            onEditComponent: (componentId) =>
              setComponentSheet({
                open: true,
                component: page.components.forms.find((form) => form.id === componentId) ?? null,
              }),
            onReplacePart: async (input) => {
              const result = await replacePartAction(input);
              if (!result.ok) return result;
              toast(result.message, {
                undo: async () => {
                  const undone = await undoReplacePartAction(result.undoItemId);
                  toast(undone.message);
                },
              });
            },
          }}
        />
      </PageBody>
      <MaintenanceSheet
        open={maintenance.open}
        onOpenChange={(open) => setMaintenance((state) => ({ ...state, open }))}
        vm={page.maintenance}
        prefill={maintenance.prefill}
        edit={maintenance.edit}
        onSubmit={async (input) => {
          const result = await saveMaintenanceAction(input);
          if (result.ok) {
            toast(result.message, {
              undo: async () => toast((await undoMaintenanceAction(result.undoEventId)).message),
            });
          }
          return result;
        }}
        onUpdate={async (eventId, input) => {
          const result = await updateMaintenanceAction(eventId, input);
          if (result.ok) toast(result.message);
          return result;
        }}
        onDelete={async (eventId) => {
          const result = await deleteMaintenanceAction(eventId);
          if (result.ok) toast(result.message);
          return result;
        }}
      />
      <RulesSheet
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        vm={page.rules}
        onSubmit={async (ruleId, input) => {
          const result = await saveRuleAction(bikeId, ruleId, input);
          if (result.ok) toast(result.message);
          return result;
        }}
      />
      <WearDetailSheet
        open={wearOpen}
        onOpenChange={setWearOpen}
        bikeName={page.vm.bike.name}
        vm={page.wear}
      />
      <ComponentSheet
        open={componentSheet.open}
        onOpenChange={(open) => setComponentSheet((state) => ({ ...state, open }))}
        bikeName={page.vm.bike.name}
        types={page.components.types}
        templates={page.components.templates}
        component={componentSheet.component}
        stockInstalledOn={page.components.stockInstalledOn}
        today={page.vm.today}
        shops={page.components.shops}
        onSubmit={async (componentId, input) => {
          const result = await saveComponentAction(bikeId, componentId, input);
          if (result.ok) toast(result.message);
          return result;
        }}
      />
    </>
  );
}
