import "server-only";
import { startOfLocalDay } from "@/lib/format";
import type { BikeCardVM, DashboardVM, RuleRowVM } from "@/lib/view-models";
import {
  listDoneTasks,
  listMaintenanceEvents,
  listOpenTasks,
  listRides,
  type AccessContext,
} from "@/server/db";
import { ridingSince } from "@/server/domain/rides";
import { byUrgency } from "@/server/domain/rules";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { bikeCard } from "./bikes";
import { taskRow } from "./refs";
import { timeline } from "./timeline";
import { loadGarage, rebuyRows } from "./workshop";

/** "Accueil" (feature 9): overdue and due-soon rules, open tasks, "À racheter", the bikes. */
export function getDashboardVM(ctx: AccessContext): DashboardVM {
  const { timeZone } = getEnv();
  const day = today();
  const monthStart = startOfLocalDay(`${day.slice(0, 7)}-01`, timeZone);
  const garage = loadGarage(ctx);
  const names = new Map(garage.bikes.map((bike) => [bike.id, bike.name]));

  const rules: RuleRowVM[] = [];
  const cards: BikeCardVM[] = [];
  for (const bike of garage.ridable) {
    const rows = (garage.rules.get(bike.id) ?? [])
      .map((entry) => entry.row)
      .filter((row) => row.status === "overdue" || row.status === "due_soon");
    rules.push(...rows);
    const month = ridingSince(garage.rides.get(bike.id) ?? [], monthStart);
    const worst = rows.some((row) => row.status === "overdue") ? "overdue" : rows[0]?.status;
    cards.push({
      ...bikeCard(bike),
      monthDistanceM: month.distanceM,
      monthDurationS: month.durationS,
      alert:
        worst === "overdue" || worst === "due_soon"
          ? { status: worst, count: rows.filter((row) => row.status === worst).length }
          : null,
    });
  }
  rules.sort(byUrgency);
  const rebuy = rebuyRows(garage.items);

  return {
    today: day,
    firstName: ctx.user.name.trim().split(/\s+/)[0] ?? ctx.user.name,
    counts: {
      overdue: rules.filter((rule) => rule.status === "overdue").length,
      dueSoon: rules.filter((rule) => rule.status === "due_soon").length,
      toRebuy: rebuy.length,
    },
    rules,
    tasks: listOpenTasks(ctx).map((task) => taskRow(task, garage.bikes, timeZone)),
    bikes: cards,
    rebuy,
    activity: timeline(
      listRides(ctx, { limit: 6 }),
      listMaintenanceEvents(ctx, null).slice(0, 6),
      listDoneTasks(ctx, { limit: 6 }),
      names,
      timeZone,
    ).slice(0, 6),
  };
}
