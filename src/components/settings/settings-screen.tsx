"use client";

import * as React from "react";
import { Download, LogOut } from "lucide-react";
import { Avatar } from "@/components/shell/nav";
import { useShell } from "@/components/shell/shell-context";
import { THEME_ICONS } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceCard } from "@/components/ui/choice-card";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";

const THEME_CHOICES: Record<ThemePreference, { title: string; meta: string }> = {
  system: { title: "Comme l'appareil", meta: "Clair ou sombre selon le réglage du système" },
  light: { title: "Clair", meta: "Toujours clair sur cet appareil" },
  dark: { title: "Sombre", meta: "Toujours sombre sur cet appareil" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** "Réglages" (feature 12): account, theme of this device, and the ZIP export (D-12). */
export function SettingsScreen({
  exportHref,
  version,
}: {
  /** The Route Handler that streams the ZIP; a plain link, so the browser downloads it. */
  exportHref: string;
  version: string;
}) {
  const { user, theme, setTheme, onSignOut } = useShell();
  const [signingOut, startSignOut] = React.useTransition();

  return (
    <div className="grid max-w-[640px] gap-7">
      <h1 className="text-[28px] leading-[1.15] font-[650] tracking-[-0.02em]">Réglages</h1>

      <Section title="Compte">
        <Card padded className="flex flex-wrap items-center gap-3">
          <Avatar name={user.name} className="size-11 text-sm" />
          <div className="min-w-0 flex-1 basis-48">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-[13.5px] text-fg-muted">{user.email}</p>
            <p className="truncate text-[13.5px] text-fg-muted">Atelier : {user.workspaceName}</p>
          </div>
          <Button
            variant="secondary"
            disabled={signingOut}
            onClick={() => startSignOut(async () => onSignOut())}
          >
            <LogOut />
            Se déconnecter
          </Button>
        </Card>
      </Section>

      <Section title="Thème">
        <div role="radiogroup" aria-label="Thème de cet appareil" className="grid gap-2">
          {THEME_PREFERENCES.map((preference) => {
            const Icon = THEME_ICONS[preference];
            return (
              <ChoiceCard
                key={preference}
                name="theme"
                value={preference}
                checked={theme === preference}
                onChange={() => setTheme(preference)}
                icon={<Icon aria-hidden />}
                title={THEME_CHOICES[preference].title}
                meta={THEME_CHOICES[preference].meta}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Mes données">
        <Card padded className="grid gap-3">
          <p className="text-[14.5px]">
            Un fichier ZIP avec toutes les données de «&nbsp;{user.workspaceName}&nbsp;» : chaque
            table en CSV (pour un tableur) et en JSON, et le dictionnaire qui explique chaque
            colonne, son unité et ses valeurs. Les comptes et les mots de passe n&apos;y sont
            jamais.
          </p>
          <p className="text-[13.5px] text-fg-muted">
            Une copie lisible, à garder où tu veux. Elle ne remplace pas la sauvegarde du dossier de
            données : l&apos;application ne sait pas la réimporter. Les photos et les documents
            s&apos;y ajouteront avec les pièces jointes.
          </p>
          <div>
            <Button asChild>
              <a href={exportHref} download>
                <Download />
                Exporter mes données
              </a>
            </Button>
          </div>
        </Card>
      </Section>

      <p className="text-[13px] text-fg-muted">Bike-Book {version}</p>
    </div>
  );
}
