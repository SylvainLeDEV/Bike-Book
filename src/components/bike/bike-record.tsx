import { cn } from "cn";
import {
  Archive,
  Bike,
  Calculator,
  CircleCheck,
  CircleSlash,
  ExternalLink,
  FileText,
  HandCoins,
  type LucideIcon,
  Paperclip,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatDate,
  formatDecimal,
  formatDistance,
  formatFileSize,
  formatHours,
  formatMoney,
  type LocalDate,
} from "@/lib/format";
import { BIKE_STATUS_EFFECTS, BIKE_STATUS_LABELS, DISCIPLINE_LABELS } from "@/lib/labels";
import type { BikeRecordVM, BikeStatus } from "@/lib/view-models";
import { SerialNumber } from "./serial-number";

export const BIKE_STATUS_ICONS: Record<BikeStatus, LucideIcon> = {
  active: CircleCheck,
  stored: Archive,
  sold: HandCoins,
  stolen: ShieldAlert,
  retired: CircleSlash,
};

type Fact = { label: string; value: string | null; figure?: boolean; wide?: boolean };

function Facts({ facts }: { facts: Fact[] }) {
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
      {facts.map((fact) => (
        <div key={fact.label} className={cn("min-w-0", fact.wide && "col-span-full")}>
          <dt className="text-[12.5px] text-fg-muted">{fact.label}</dt>
          <dd
            className={cn(
              "mt-0.5 [overflow-wrap:anywhere]",
              fact.figure && fact.value
                ? "num text-[19px] leading-tight font-semibold"
                : "text-[14.5px] font-semibold",
              !fact.value && "font-normal text-fg-muted",
            )}
          >
            {fact.value ?? "Non renseigné"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecordCard({
  icon: Icon,
  title,
  id,
  children,
}: {
  icon: LucideIcon;
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <Card asChild padded>
      <section aria-labelledby={id}>
        <h3 id={id} className="mb-3 flex items-center gap-2 eyebrow [&_svg]:size-4">
          <Icon aria-hidden />
          {title}
        </h3>
        {children}
      </section>
    </Card>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border not-first:mt-3.5 not-first:border-t not-first:pt-3.5">
      <p className="mb-2 text-[13.5px] leading-tight font-semibold">{label}</p>
      {children}
    </div>
  );
}

/** The bike record (D-43): identity, purchase, security and status, total cost (D-44). */
export function BikeRecord({
  record,
  today,
  documentAction,
  statusAction,
}: {
  record: BikeRecordVM;
  today: LocalDate;
  /** "Joindre un document" control. */
  documentAction?: React.ReactNode;
  /** "Changer" control, next to the status. */
  statusAction?: React.ReactNode;
}) {
  const { identity, purchase, cost } = record;
  const StatusIcon = BIKE_STATUS_ICONS[record.status];
  const since = (on: LocalDate | null) => (on ? formatDate(on, { year: "always" }) : null);

  return (
    <div className="grid gap-3.5">
      <RecordCard icon={Bike} title="Identité" id="record-identity">
        <Facts
          facts={[
            { label: "Marque", value: identity.brand },
            { label: "Modèle", value: identity.model },
            {
              label: "Année",
              value: identity.modelYear ? String(identity.modelYear) : null,
              figure: true,
            },
            { label: "Discipline", value: DISCIPLINE_LABELS[identity.discipline] },
            { label: "Taille", value: identity.frameSize },
            { label: "Roues", value: identity.wheelSize ? `${identity.wheelSize} pouces` : null },
            { label: "Couleur", value: identity.color },
            {
              label: "Poids",
              value: identity.weightG ? `${formatDecimal(identity.weightG / 1000, 1)} kg` : null,
              figure: true,
            },
            {
              label: "Assistance",
              value: identity.isElectric ? "Oui, électrique" : "Non, musculaire",
            },
          ]}
        />
      </RecordCard>

      <RecordCard icon={Receipt} title="Achat" id="record-purchase">
        <Facts
          facts={[
            { label: "Date", value: since(purchase.purchasedOn) },
            {
              label: "Prix",
              value: purchase.priceCents != null ? formatMoney(purchase.priceCents) : null,
              figure: true,
            },
            {
              label: "Boutique",
              value: purchase.shop
                ? `${purchase.shop.name} · ${purchase.shop.kind === "online" ? "en ligne" : "en magasin"}`
                : null,
            },
            { label: "État", value: purchase.boughtUsed ? "Occasion" : "Neuf" },
            {
              label: "Distance à l'achat",
              value: formatDistance(purchase.initialDistanceM),
              figure: true,
            },
            { label: "Heures à l'achat", value: formatHours(purchase.initialWearS), figure: true },
          ]}
        />
      </RecordCard>

      <RecordCard icon={ShieldCheck} title="Sécurité" id="record-security">
        <Block label="Numéro de cadre">
          {record.frameSerial ? (
            <SerialNumber serial={record.frameSerial} />
          ) : (
            <p className="text-sm text-fg-muted">
              Pas encore noté. Il est gravé sous le boîtier de pédalier, le plus souvent.
            </p>
          )}
        </Block>
        <Block label="Factures et documents">
          <ul className="m-0 mt-1 list-none divide-y divide-border p-0">
            {record.documents.map((doc) => (
              <li key={doc.id} className="flex min-h-[60px] items-center gap-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-muted">
                  <FileText className="size-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold [overflow-wrap:anywhere]">{doc.name}</p>
                  <p className="text-[13px] text-fg-muted">
                    PDF · {formatFileSize(doc.sizeBytes)} ·{" "}
                    {formatDate(doc.addedOn, { month: "short" })}
                  </p>
                </div>
                <Button variant="ghost" size="icon" asChild>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Ouvrir ${doc.name}, nouvel onglet`}
                  >
                    <ExternalLink />
                  </a>
                </Button>
              </li>
            ))}
          </ul>
          {documentAction ?? (
            <p className="mt-1 flex items-center gap-1.5 hint">
              <Paperclip className="size-3.5" aria-hidden />
              PDF ou photo, 25 Mo au maximum.
            </p>
          )}
        </Block>
        <Block label="Statut">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge>
              <StatusIcon aria-hidden />
              {BIKE_STATUS_LABELS[record.status]}
            </Badge>
            {record.statusChangedOn ? (
              <span className="hint">depuis le {since(record.statusChangedOn)}</span>
            ) : null}
            {statusAction}
          </div>
          <p className="mt-2 hint">{BIKE_STATUS_EFFECTS[record.status]}</p>
          {record.status === "stolen" ? (
            <p className="mt-2 hint">
              Pour la déclaration : numéro de cadre ci-dessus, photos et facture d&apos;achat.
            </p>
          ) : null}
        </Block>
      </RecordCard>

      <RecordCard icon={Wallet} title="Coût total" id="record-cost">
        <TotalCost cost={cost} since={since(record.purchase.purchasedOn)} today={today} />
      </RecordCard>
    </div>
  );
}

function TotalCost({
  cost,
  since,
  today,
}: {
  cost: BikeRecordVM["cost"];
  since: string | null;
  today: LocalDate;
}) {
  const parts = [cost.purchaseCents, cost.shopCents, cost.homeCents].map(formatMoney).join(" + ");
  const sale = cost.saleCents != null ? ` − ${formatMoney(cost.saleCents)}` : "";
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="num text-4xl leading-none font-bold">{formatMoney(cost.totalCents)}</span>
        {since ? <span className="hint">depuis le {since}</span> : null}
      </p>
      <ul className="m-0 mt-3 list-none p-0 text-sm">
        {[
          { label: "Achat", hint: since, cents: cost.purchaseCents },
          {
            label: "Entretiens en atelier",
            hint: `${cost.shopVisits} visite${cost.shopVisits > 1 ? "s" : ""}, main-d'œuvre et pièces`,
            cents: cost.shopCents,
          },
          {
            label: "Pièces montées à la maison",
            hint: `${cost.homeEvents} entretien${cost.homeEvents > 1 ? "s" : ""}`,
            cents: cost.homeCents,
          },
          ...(cost.saleCents != null
            ? [{ label: "Revente", hint: "déduite du total", cents: -cost.saleCents }]
            : []),
        ].map((row) => (
          <li
            key={row.label}
            className="flex items-baseline justify-between gap-3 border-t border-border py-2"
          >
            <span>
              {row.label}
              {row.hint ? <span className="block hint">{row.hint}</span> : null}
            </span>
            <span className="num text-[17px] leading-none font-semibold whitespace-nowrap">
              {formatMoney(row.cents)}
            </span>
          </li>
        ))}
      </ul>
      {cost.per100KmCents != null && cost.per100KmUpkeepCents != null ? (
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border">
          {[
            { cents: cost.per100KmCents, label: "pour 100 km" },
            { cents: cost.per100KmUpkeepCents, label: "pour 100 km, hors achat" },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface px-4 py-3.5">
              <div className="num text-[26px] leading-none font-bold">
                {formatDecimal(stat.cents / 100, 2)}
                <small className="ml-[3px] text-[17px] font-medium text-fg-muted">€</small>
              </div>
              <div className="mt-1.5 text-[13px] text-fg-muted">{stat.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 hint">Le coût pour 100 km s&apos;affiche dès la première sortie.</p>
      )}
      <details className="group mt-3">
        <summary className="flex min-h-8 list-none flex-wrap items-center gap-2 text-[13.5px] font-medium text-brand-ink pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
          <Calculator className="size-4" aria-hidden />
          Voir le calcul
        </summary>
        {cost.per100KmCents != null ? (
          <p className="mt-2 rounded-control bg-surface-2 px-3 py-2.5 num text-[15px] leading-normal font-medium [overflow-wrap:anywhere]">
            ({parts}){sale} ÷ {formatDistance(cost.riddenDistanceM)} × 100 ={" "}
            {formatMoney(cost.per100KmCents)}
          </p>
        ) : null}
        <ol className="mt-2 grid gap-1 pl-[18px] text-[13.5px] text-fg-muted">
          {cost.events.map((event) => (
            <li key={event.id}>
              {formatDate(event.on, { month: "short", year: "auto", today })} · {event.title}
              {event.shopName ? ` (${event.shopName})` : ""} :{" "}
              <span className="num font-semibold text-fg">{formatMoney(event.costCents)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 hint">
          {formatDistance(cost.riddenDistanceM)} sur {cost.rideCount} sorties, sans la distance
          d&apos;avant l&apos;achat. Les pièces comptent une seule fois, par leurs entretiens ; les
          outils de l&apos;atelier ne comptent pas. Si tu vends le vélo, son prix de vente sera
          déduit.
        </p>
      </details>
    </>
  );
}
