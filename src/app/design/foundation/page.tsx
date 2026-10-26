"use client";

import * as React from "react";
import { Archive, Pause, Plus, ShoppingCart, TrendingUp, Wrench } from "lucide-react";
import { BikeLine } from "@/components/bike-cover";
import { EmptyState } from "@/components/empty-state";
import { useQuickRide } from "@/components/rides/quick-ride";
import { PageBody, Topbar } from "@/components/shell/topbar";
import { RebuyBadge, RuleStatusBadge, WearBar } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, Fieldset, Input } from "@/components/ui/field";
import {
  SegmentedTabs,
  SegmentedTabsContent,
  SegmentedTabsList,
  SegmentedTabsTrigger,
} from "@/components/ui/segmented-tabs";
import { SkeletonRow } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ContrastTable, Swatches } from "./live-tokens";

function Board({
  kicker,
  title,
  lead,
  wide,
  children,
}: {
  kicker: string;
  title: string;
  lead?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card asChild className={wide ? "min-w-0 p-5 min-[900px]:col-span-full" : "min-w-0 p-5"}>
      <section aria-label={title}>
        <p className="eyebrow">{kicker}</p>
        <h2 className="mt-1 mb-3.5 text-[19px] leading-tight font-[650] tracking-[-0.01em]">
          {title}
        </h2>
        {lead ? <p className="-mt-1.5 mb-3.5 max-w-[70ch] text-sm text-fg-muted">{lead}</p> : null}
        {children}
      </section>
    </Card>
  );
}

function TypeRow({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0">
      <span className="font-mono text-xs text-fg-muted">{tag}</span>
      {children}
    </div>
  );
}

/** The design system's own board: tokens, live contrast, type, shapes, components, states. */
export default function FoundationPage() {
  const toast = useToast();
  const { open: openQuickRide } = useQuickRide();
  const [demoChip, setDemoChip] = React.useState("dry");

  return (
    <>
      <Topbar />
      <PageBody className="max-w-[1320px]">
        <div className="mb-4">
          <p className="eyebrow">Design system</p>
          <h1 className="mt-1 text-[28px] leading-[1.15] font-[650] tracking-[-0.02em]">
            Fondation
          </h1>
          <p className="mt-2 max-w-[64ch] text-[14.5px] text-fg-muted">
            Les tokens de la maquette validée (D-30), dans les deux thèmes (D-31). Change de thème
            avec le bouton en haut : les valeurs et les contrastes se recalculent.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
          <Board
            wide
            kicker="Couleurs"
            title="Palette du thème affiché"
            lead="Un accent turquoise « anodisé », des gris légèrement bleutés, et trois couleurs de statut réservées à l'usure."
          >
            <Swatches />
          </Board>

          <Board
            kicker="Accessibilité"
            title="Contrastes mesurés"
            lead="Calculés en direct dans le thème affiché. Seuil AA : 4,5:1 pour le texte."
          >
            <ContrastTable />
          </Board>

          <Board kicker="Typographie" title="Deux familles, six tailles">
            <TypeRow tag="Chiffres · Barlow Semi Condensed 700 · 40/44">
              <span className="num text-[40px] leading-[44px] font-bold">
                2&#8239;846&nbsp;km · 56&#8239;h&#8239;20
              </span>
            </TypeRow>
            <TypeRow tag="Titre de page · Geist 650 · 28/32">
              <span className="text-[28px] leading-8 font-[650] tracking-[-0.02em]">
                Bonjour Camille
              </span>
            </TypeRow>
            <TypeRow tag="Titre de section · Geist 600 · 17/22">
              <span className="text-[17px] leading-[22px] font-semibold">À prévoir</span>
            </TypeRow>
            <TypeRow tag="Corps · Geist 400 · 16/24">
              <span className="text-base">
                Entretien des bas de fourreaux toutes les 50&nbsp;h d&apos;usure.
              </span>
            </TypeRow>
            <TypeRow tag="Secondaire · Geist 400 · 13/18">
              <span className="text-[13px] leading-[18px] text-fg-muted">
                Spectral · Fourche RockShox Lyrik · dernière fois le 2 mars
              </span>
            </TypeRow>
            <TypeRow tag="Étiquette · Geist 600 · 12/16 · capitales">
              <span className="eyebrow">Suspension</span>
            </TypeRow>
          </Board>

          <Board kicker="Formes" title="Arrondis, ombres, espacements">
            <div className="flex flex-wrap gap-2.5">
              {[
                ["rounded-control", "10 · champ"],
                ["rounded-card", "14 · carte"],
                ["rounded-sheet", "22 · feuille"],
                ["rounded-full", "pastille"],
              ].map(([radius, label]) => (
                <div
                  key={label}
                  className={`grid h-14 w-[76px] place-items-center border border-border bg-surface-2 text-center text-xs text-fg-muted ${radius}`}
                >
                  {label}
                </div>
              ))}
            </div>
            <p className="mt-[18px] mb-2.5 text-sm font-semibold">Ombres (atténuées en sombre)</p>
            <div className="flex flex-wrap gap-2.5">
              {(["--shadow-sm", "--shadow-md", "--shadow-lg"] as const).map((shadow) => (
                <div
                  key={shadow}
                  className="grid h-16 w-24 place-items-center rounded-card border border-border bg-surface text-xs text-fg-muted"
                  style={{ boxShadow: `var(${shadow})` }}
                >
                  {shadow.replace("--shadow-", "")}
                </div>
              ))}
            </div>
            <p className="mt-[18px] mb-2.5 text-sm font-semibold">Espacements (pas de 4 px)</p>
            <div className="grid gap-1.5 font-mono text-xs text-fg-muted">
              {[
                [4, "4"],
                [8, "8"],
                [12, "12"],
                [16, "16 · marge mobile"],
                [24, "24 · marge tablette"],
                [32, "32 · marge PC"],
              ].map(([width, label]) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span
                    className="block h-2.5 rounded-[3px] bg-brand"
                    style={{ width: Number(width) }}
                  />
                  {label}
                </div>
              ))}
            </div>
          </Board>

          <Board kicker="Composants" title="Boutons, champs, statuts">
            <div className="grid gap-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <Button>
                  <Plus />
                  Ajouter
                </Button>
                <Button variant="secondary">
                  <Wrench />
                  Entretien
                </Button>
                <Button variant="ghost">Annuler</Button>
                <Button variant="danger">
                  <Archive />
                  Retirer le vélo
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button size="sm">Petit</Button>
                <Button size="lg">Grand</Button>
                <Button variant="link">Lien</Button>
                <Button disabled>Désactivé</Button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Distance">
                  <Input inputMode="decimal" defaultValue="42,5" suffix="km" />
                </Field>
                <Field label="Durée" error="Indique une durée.">
                  <Input suffix="h" />
                </Field>
              </div>
              <Fieldset legend="Conditions" hint="facultatif">
                <ChipRow>
                  {[
                    ["dry", "Sec"],
                    ["wet", "Humide"],
                    ["mud", "Boue"],
                  ].map(([value, label]) => (
                    <Chip
                      key={value}
                      name="demo-conditions"
                      value={value}
                      checked={demoChip === value}
                      onChange={() => setDemoChip(value)}
                    >
                      {label}
                    </Chip>
                  ))}
                </ChipRow>
              </Fieldset>
              <div className="flex flex-wrap gap-2.5">
                <RuleStatusBadge status="ok" />
                <RuleStatusBadge status="due_soon" />
                <RuleStatusBadge status="overdue" />
                <Badge>
                  <Pause aria-hidden />
                  En pause
                </Badge>
                <Badge variant="outline">
                  <TrendingUp aria-hidden />
                  Estimation
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <RebuyBadge state="to_order" />
                <RebuyBadge state="ordered" />
                <RebuyBadge state="low_stock" />
              </div>
              <p className="hint">
                Atelier : les états de rachat utilisent l&apos;accent et les neutres, jamais le
                vert, l&apos;ambre ou le rouge réservés à l&apos;usure. Chacun a son icône et son
                libellé.
              </p>
              <div className="grid gap-3.5">
                <WearBar ratio={0.45} warnRatio={0.9} status="ok" label="225 km sur 500 km" />
                <WearBar ratio={0.92} warnRatio={0.9} status="due_soon" label="46 h sur 50 h" />
                <WearBar ratio={1.13} warnRatio={0.9} status="overdue" label="56 h 20 sur 50 h" />
                <p className="hint">
                  Le trait marque le seuil « bientôt » (90 %). Au-delà de 100 %, la barre est
                  hachurée : le statut ne repose jamais sur la seule couleur.
                </p>
              </div>
              <SegmentedTabs defaultValue="a">
                <SegmentedTabsList aria-label="Exemple d'onglets">
                  <SegmentedTabsTrigger value="a">Monté aujourd&apos;hui</SegmentedTabsTrigger>
                  <SegmentedTabsTrigger value="b">Fiche d&apos;origine</SegmentedTabsTrigger>
                </SegmentedTabsList>
                <SegmentedTabsContent value="a" className="mt-2 hint">
                  Flèches gauche et droite pour changer d&apos;onglet.
                </SegmentedTabsContent>
                <SegmentedTabsContent value="b" className="mt-2 hint">
                  Deuxième vue du même contenu.
                </SegmentedTabsContent>
              </SegmentedTabs>
            </div>
          </Board>

          <Board kicker="États" title="Vide, chargement, confirmation">
            <div className="grid gap-3.5">
              <EmptyState
                art={<BikeLine />}
                title="Aucun vélo pour l'instant"
                action={
                  <Button onClick={() => toast("Ajout d'un vélo : fonctionnalité 1")}>
                    <Plus />
                    Ajouter un vélo
                  </Button>
                }
              >
                Ajoute ton premier vélo pour suivre ses sorties, son entretien et ses pièces.
              </EmptyState>
              <Card aria-label="Chargement en cours" role="status">
                <SkeletonRow />
                <span className="sr-only">Chargement…</span>
              </Card>
              <div className="flex flex-wrap gap-2.5">
                <Button
                  variant="secondary"
                  onClick={() =>
                    toast("Sortie ajoutée à Spectral · 2 h 30", {
                      undo: () => toast("Sortie supprimée"),
                    })
                  }
                >
                  Afficher un toast
                </Button>
                <Button variant="secondary" onClick={() => openQuickRide()}>
                  Ouvrir une feuille
                </Button>
                <Button variant="secondary" onClick={() => toast("Ajouté à « À racheter »")}>
                  <ShoppingCart />
                  Toast sans annulation
                </Button>
              </div>
              <p className="hint">
                Transitions de 160 à 280 ms au survol, à l&apos;appui et à l&apos;ouverture des
                feuilles. Elles sont coupées quand le système demande moins d&apos;animations.
              </p>
            </div>
          </Board>
        </div>
      </PageBody>
    </>
  );
}
