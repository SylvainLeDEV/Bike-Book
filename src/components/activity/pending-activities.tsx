"use client";

import * as React from "react";
import { Download, Link2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, List } from "@/components/ui/card";
import { FieldError, NativeSelect } from "@/components/ui/field";
import { Fold } from "@/components/ui/fold";
import { useToast } from "@/components/ui/toast";
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  type LocalDate,
} from "@/lib/format";
import { PENDING_REASON_LABELS } from "@/lib/labels";
import type {
  EditResult,
  IgnoredActivityVM,
  PendingActivitiesVM,
  PendingActivityVM,
} from "@/lib/view-models";

/*
 * "À classer" in Activité (D-101): Garmin activities that did not become a ride on their own,
 * because their type has no bike, that bike is no longer ridden, or a ride typed by hand starts
 * at the same time. One click imports, links or ignores each.
 */

export type PendingActivitiesProps = {
  vm: PendingActivitiesVM;
  today: LocalDate;
  onImport: (id: number, bikeId: number) => Promise<EditResult>;
  onLink: (id: number) => Promise<EditResult>;
  onIgnore: (id: number) => Promise<EditResult>;
  /** "Remettre à classer" an ignored activity. */
  onRestore: (id: number) => Promise<EditResult>;
};

/** "12 km · 1 h 05 · 210 m D+" for an activity's figures. */
function figuresOf(
  activity: Pick<PendingActivityVM, "distanceM" | "durationS" | "elevationGainM">,
) {
  return [
    activity.distanceM != null ? formatDistance(activity.distanceM, 1) : null,
    activity.durationS != null ? formatDuration(activity.durationS) : null,
    activity.elevationGainM ? `${formatElevation(activity.elevationGainM)} D+` : null,
  ].filter(Boolean);
}

function Row({
  activity,
  bikes,
  today,
  onImport,
  onLink,
  onIgnore,
}: Omit<PendingActivitiesProps, "vm" | "onRestore"> & {
  activity: PendingActivityVM;
  bikes: PendingActivitiesVM["bikes"];
}) {
  const toast = useToast();
  const [bikeId, setBikeId] = React.useState(
    String(activity.suggestedBikeId ?? bikes[0]?.id ?? ""),
  );
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const selectId = React.useId();

  async function act(run: () => Promise<EditResult>) {
    setPending(true);
    setError(null);
    try {
      const result = await run();
      if (result.ok) toast(result.message);
      else setError(result.error);
    } catch {
      setError("Impossible pour l'instant. Vérifie la connexion et réessaie.");
    } finally {
      setPending(false);
    }
  }

  const figures = figuresOf(activity);

  return (
    <li className="grid gap-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-semibold">
          {activity.name ?? activity.typeLabel}
          {activity.name && activity.name !== activity.typeLabel ? (
            <span className="font-normal text-fg-muted"> · {activity.typeLabel}</span>
          ) : null}
        </p>
        <p className="text-[13.5px] text-fg-muted">
          {formatDate(activity.startedOn, {
            weekday: "short",
            month: "short",
            year: "auto",
            today,
            capitalized: true,
          })}{" "}
          à {activity.time}
          {figures.length ? ` · ${figures.join(" · ")}` : ""}
        </p>
        <p className="text-[13.5px] text-soon-ink">
          {PENDING_REASON_LABELS[activity.reason]}
          {activity.nearRide ? ` : ${activity.nearRide.label}` : ""}
        </p>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          Vélo de cette sortie
        </label>
        <NativeSelect
          id={selectId}
          className="min-w-44 flex-1 md:flex-none"
          value={bikeId}
          disabled={pending || bikes.length === 0}
          onChange={(event) => setBikeId(event.target.value)}
        >
          {bikes.map((bike) => (
            <option key={bike.id} value={bike.id}>
              {bike.name}
            </option>
          ))}
        </NativeSelect>
        <Button
          disabled={pending || !bikeId}
          onClick={() => act(() => onImport(activity.id, Number(bikeId)))}
        >
          <Download />
          Importer
        </Button>
        {activity.nearRide ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => act(() => onLink(activity.id))}
          >
            <Link2 />
            C&apos;est la même sortie
          </Button>
        ) : null}
        <Button variant="ghost" disabled={pending} onClick={() => act(() => onIgnore(activity.id))}>
          Ignorer
        </Button>
      </div>
    </li>
  );
}

function IgnoredRow({
  activity,
  today,
  onRestore,
}: {
  activity: IgnoredActivityVM;
  today: LocalDate;
  onRestore: PendingActivitiesProps["onRestore"];
}) {
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const figures = figuresOf(activity);
  return (
    <li className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="font-semibold">
          {activity.name ?? activity.typeLabel}
          {activity.name && activity.name !== activity.typeLabel ? (
            <span className="font-normal text-fg-muted"> · {activity.typeLabel}</span>
          ) : null}
        </p>
        <p className="text-[13.5px] text-fg-muted">
          {formatDate(activity.startedOn, {
            weekday: "short",
            month: "short",
            year: "auto",
            today,
            capitalized: true,
          })}{" "}
          à {activity.time}
          {figures.length ? ` · ${figures.join(" · ")}` : ""}
        </p>
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
      <div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              const result = await onRestore(activity.id);
              if (result.ok) toast(result.message);
              else setError(result.error);
            } catch {
              setError("Impossible pour l'instant. Vérifie la connexion et réessaie.");
            } finally {
              setPending(false);
            }
          }}
        >
          <Undo2 />
          Remettre à classer
        </Button>
      </div>
    </li>
  );
}

export function PendingActivities({ vm, onRestore, ...props }: PendingActivitiesProps) {
  const [ignoredOpen, setIgnoredOpen] = React.useState(false);
  if (vm.activities.length === 0 && vm.ignored.length === 0) return null;
  return (
    <section aria-labelledby="a-classer" className="mb-6 grid gap-3">
      {vm.activities.length > 0 ? (
        <>
          <div>
            <h2 id="a-classer" className="text-[17px] font-semibold tracking-[-0.01em]">
              À classer
            </h2>
            <p className="text-[13.5px] text-fg-muted">
              Des activités Garmin qui attendent leur vélo. Une activité ignorée reste dans la liste
              des ignorées, d&apos;où tu peux la remettre à classer.
            </p>
          </div>
          <Card padded>
            <List aria-label="Activités à classer">
              {vm.activities.map((activity) => (
                <Row key={activity.id} activity={activity} bikes={vm.bikes} {...props} />
              ))}
            </List>
          </Card>
        </>
      ) : (
        <h2 id="a-classer" className="sr-only">
          Activités Garmin
        </h2>
      )}
      {vm.ignored.length > 0 ? (
        <Fold
          open={ignoredOpen}
          onOpenChange={setIgnoredOpen}
          title="Activités ignorées"
          hint={`· ${vm.ignored.length}`}
        >
          <Card padded>
            <List aria-label="Activités ignorées">
              {vm.ignored.map((activity) => (
                <IgnoredRow
                  key={activity.id}
                  activity={activity}
                  today={props.today}
                  onRestore={onRestore}
                />
              ))}
            </List>
          </Card>
        </Fold>
      ) : null}
    </section>
  );
}
