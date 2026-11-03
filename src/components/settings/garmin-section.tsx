"use client";

import * as React from "react";
import { KeyRound, Plus, RefreshCw, Save, TriangleAlert } from "lucide-react";
import { DeleteConfirm } from "@/components/delete-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, List } from "@/components/ui/card";
import { Field, FieldError, Input, NativeSelect } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatCount, formatDate, formatDayLabel, type LocalDate } from "@/lib/format";
import type {
  EditResult,
  GarminKeyInput,
  GarminKeyResult,
  GarminKeyStateVM,
  GarminSettingsVM,
} from "@/lib/view-models";

/*
 * "Garmin Connect" in Paramètres (D-101): the personal API key (typed once, masked, never shown
 * again: its last 4 characters only), its expiry date, the first import's day, the last import,
 * and which bike each Garmin activity type goes to.
 */

export type GarminSectionProps = {
  vm: GarminSettingsVM;
  onSaveKey: (input: GarminKeyInput) => Promise<GarminKeyResult>;
  onSync: () => Promise<EditResult>;
  onDisconnect: () => Promise<EditResult>;
  onSetTypeBike: (activityType: string, bikeId: number | null) => Promise<EditResult>;
};

function KeyStateBadge({ state }: { state: GarminKeyStateVM }) {
  switch (state.state) {
    case "ok":
      return <Badge variant="ok">Active</Badge>;
    case "expires_soon":
      return (
        <Badge variant="soon">
          {state.daysLeft === 0
            ? "Expire aujourd'hui"
            : `Expire dans ${formatCount(state.daysLeft, "jour", "jours")}`}
        </Badge>
      );
    case "expired":
      return <Badge variant="late">Clé expirée</Badge>;
    case "rejected":
      return <Badge variant="late">Clé refusée</Badge>;
  }
}

function KeyForm({
  connected,
  initial,
  onSave,
  onDone,
}: {
  connected: boolean;
  initial: { keyExpiresOn: string; importFrom: string };
  onSave: GarminSectionProps["onSaveKey"];
  onDone: (message: string) => void;
}) {
  const [key, setKey] = React.useState("");
  const [keyExpiresOn, setKeyExpiresOn] = React.useState(initial.keyExpiresOn);
  const [importFrom, setImportFrom] = React.useState(initial.importFrom);
  const [errors, setErrors] = React.useState<Partial<Record<keyof GarminKeyInput, string>>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected && !key.trim()) {
      setErrors({ key: "Colle la clé API créée dans Garmin Connect." });
      return;
    }
    setErrors({});
    setError(null);
    setPending(true);
    try {
      const result = await onSave({ key: key.trim(), keyExpiresOn, importFrom });
      if (result.ok) {
        // Never kept in the page once saved.
        setKey("");
        onDone(result.message);
      } else {
        setErrors(result.fieldErrors ?? {});
        setError(result.error ?? null);
      }
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
        <Field
          label="Clé API personnelle"
          hint={
            connected
              ? "Laisse vide pour garder la clé enregistrée. Colle une nouvelle clé pour la remplacer."
              : "Dans Garmin Connect : Paramètres → Clé API personnelle. Elle n'est affichée qu'une fois : colle-la ici. Bike-Book la garde chiffrée et ne l'affiche plus jamais."
          }
          error={errors.key}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            placeholder={connected ? "Garder la clé enregistrée" : "Colle la clé ici"}
            value={key}
            data-autofocus=""
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>
        <Field
          label="La clé expire le"
          hint="La durée choisie à sa création (30, 90, 180 jours ou 1 an). Garmin ne permet pas de la lire : Bike-Book s'en sert pour te prévenir 30 puis 7 jours avant."
          error={errors.keyExpiresOn}
        >
          <Input
            type="date"
            value={keyExpiresOn}
            onChange={(e) => setKeyExpiresOn(e.target.value)}
          />
        </Field>
        <Field
          label="Importer les sorties à partir du"
          hint={
            connected
              ? "Compte pour le premier import. Ensuite, chaque import reprend après la dernière activité lue : une date plus ancienne ne ramène pas les sorties d'avant."
              : "Les sorties d'avant ne sont pas importées : leur usure est déjà dans les compteurs initiaux de tes vélos et de tes pièces."
          }
          error={errors.importFrom}
        >
          <Input type="date" value={importFrom} onChange={(e) => setImportFrom(e.target.value)} />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Save />
          Enregistrer
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}

function TypeBikeRow({
  type,
  bikes,
  onSet,
}: {
  type: GarminSettingsVM["types"][number];
  bikes: GarminSettingsVM["bikes"];
  onSet: GarminSectionProps["onSetTypeBike"];
}) {
  const toast = useToast();
  const [value, setValue] = React.useState(type.bikeId == null ? "" : String(type.bikeId));
  const [pending, setPending] = React.useState(false);
  const id = React.useId();

  return (
    <li className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
      <label htmlFor={id} className="min-w-0">
        <span className="block font-semibold">{type.label}</span>
        <span className="block text-[13.5px] text-fg-muted">
          {type.count > 0
            ? `${formatCount(type.count, "activité lue", "activités lues")}`
            : "Pas encore d'activité lue"}
          {type.label !== type.activityType ? (
            <span className="font-mono text-[12px]"> · {type.activityType}</span>
          ) : null}
        </span>
      </label>
      <NativeSelect
        id={id}
        value={value}
        disabled={pending}
        onChange={async (event) => {
          const next = event.target.value;
          const previous = value;
          setValue(next);
          setPending(true);
          try {
            const result = await onSet(type.activityType, next ? Number(next) : null);
            if (result.ok) toast(result.message);
            else {
              setValue(previous);
              toast(result.error);
            }
          } catch {
            setValue(previous);
            toast("Enregistrement impossible. Vérifie la connexion et réessaie.");
          } finally {
            setPending(false);
          }
        }}
      >
        <option value="">À classer à chaque fois</option>
        {bikes.map((bike) => (
          <option key={bike.id} value={bike.id}>
            {bike.name}
          </option>
        ))}
      </NativeSelect>
    </li>
  );
}

export function GarminSection({
  vm,
  onSaveKey,
  onSync,
  onDisconnect,
  onSetTypeBike,
}: GarminSectionProps) {
  const toast = useToast();
  const [sheet, setSheet] = React.useState({ open: false, key: 0 });
  const [syncing, startSync] = React.useTransition();
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const connection = vm.connection;
  const day = (date: LocalDate) =>
    formatDate(date, { month: "long", year: "auto", today: vm.today });

  const openSheet = () => setSheet((s) => ({ open: true, key: s.key + 1 }));

  return (
    <Card padded className="grid gap-4" id="garmin">
      <p className="text-[14.5px]">
        Les sorties vélo enregistrées par ton Garmin arrivent toutes seules
        {vm.syncIntervalH > 0 ? `, toutes les ${vm.syncIntervalH} h,` : ""} sur le vélo choisi pour
        leur type d&apos;activité. Bike-Book ne fait que lire ton compte Garmin Connect.
      </p>

      {connection ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <KeyStateBadge state={connection.keyState} />
            <span className="text-[13.5px] text-fg-muted">
              Clé <span className="font-mono text-[12.5px]">••••{connection.keyHint}</span>,
              enregistrée le {day(connection.keySavedOn)}
            </span>
          </div>
          <dl className="grid gap-1 text-[14px] md:grid-cols-[max-content_1fr] md:gap-x-4">
            <dt className="text-fg-muted">Expire le</dt>
            <dd>{day(connection.keyExpiresOn)}</dd>
            <dt className="text-fg-muted">Importe depuis le</dt>
            <dd>{day(connection.importFrom)}</dd>
            <dt className="text-fg-muted">Dernier import</dt>
            <dd>
              {connection.lastSync
                ? `${formatDayLabel(connection.lastSync.on, vm.today)} à ${connection.lastSync.time}`
                : "Pas encore"}
            </dd>
          </dl>
          {connection.lastError ? (
            <p className="flex items-start gap-2 rounded-control bg-late-soft px-3 py-2.5 text-[14px] leading-[1.45] text-late-ink">
              <TriangleAlert className="mt-0.5 size-[17px] shrink-0" aria-hidden />
              <span>{connection.lastError}</span>
            </p>
          ) : null}
          {/* The import records its error too: shown once, in the box above. */}
          {syncError && syncError !== connection.lastError ? (
            <FieldError>{syncError}</FieldError>
          ) : null}
          {vm.pendingCount > 0 ? (
            <p className="text-[14px]">
              <a
                className="font-semibold text-brand-ink underline underline-offset-3"
                href="/activity#a-classer"
              >
                {formatCount(vm.pendingCount, "activité à classer", "activités à classer")}
              </a>{" "}
              dans Activité.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={syncing}
              onClick={() =>
                startSync(async () => {
                  setSyncError(null);
                  try {
                    const result = await onSync();
                    if (result.ok) toast(result.message);
                    else setSyncError(result.error);
                  } catch {
                    setSyncError("Import impossible. Vérifie la connexion et réessaie.");
                  }
                })
              }
            >
              <RefreshCw className={syncing ? "animate-spin" : undefined} />
              {syncing ? "Import en cours…" : "Synchroniser maintenant"}
            </Button>
            <Button variant="secondary" onClick={openSheet}>
              <KeyRound />
              Changer la clé ou les dates
            </Button>
            {confirming ? null : (
              <Button
                variant="ghost"
                className="text-late-ink hover:text-late-ink"
                onClick={() => setConfirming(true)}
              >
                Déconnecter
              </Button>
            )}
          </div>
          {confirming ? (
            <DeleteConfirm
              question="Déconnecter Garmin ? La clé est effacée de Bike-Book et l'import s'arrête. Les sorties déjà importées restent."
              confirmLabel="Déconnecter"
              pending={disconnecting}
              onCancel={() => setConfirming(false)}
              onConfirm={async () => {
                setDisconnecting(true);
                try {
                  const result = await onDisconnect();
                  toast(result.ok ? result.message : result.error);
                } finally {
                  setDisconnecting(false);
                  setConfirming(false);
                }
              }}
            />
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-[13.5px] text-fg-muted">
            Crée une clé dans Garmin Connect (Paramètres → Clé API personnelle) et note la date
            d&apos;expiration que tu choisis. La clé donne accès en lecture à tes activités et à tes
            données de santé : garde-la comme un mot de passe.
          </p>
          <div>
            <Button onClick={openSheet}>
              <Plus />
              Ajouter la clé API Garmin
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 border-t border-border pt-4">
        <div>
          <h3 className="font-semibold">Vélo par type d&apos;activité</h3>
          <p className="text-[13.5px] text-fg-muted">
            Une activité dont le type a un vélo devient une sortie de ce vélo. Les autres attendent
            dans « À classer » (Activité), tout comme une activité qui commence à la même heure
            qu&apos;une sortie saisie à la main.
          </p>
        </div>
        {vm.bikes.length > 0 ? (
          <List aria-label="Vélo par type d'activité">
            {vm.types.map((type) => (
              <TypeBikeRow
                // A new bike from the server starts the row again.
                key={`${type.activityType}:${type.bikeId}`}
                type={type}
                bikes={vm.bikes}
                onSet={onSetTypeBike}
              />
            ))}
          </List>
        ) : (
          <p className="text-[13.5px] text-fg-muted">Ajoute d&apos;abord un vélo.</p>
        )}
      </div>

      <Sheet open={sheet.open} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}>
        <SheetContent
          title="Clé API Garmin"
          description="Lecture seule de tes activités Garmin Connect."
        >
          <KeyForm
            key={sheet.key}
            connected={connection != null}
            initial={{
              keyExpiresOn: connection?.keyExpiresOn ?? "",
              importFrom: connection?.importFrom ?? vm.today,
            }}
            onSave={onSaveKey}
            onDone={(message) => {
              setSheet((s) => ({ ...s, open: false }));
              toast(message);
            }}
          />
        </SheetContent>
      </Sheet>
    </Card>
  );
}
