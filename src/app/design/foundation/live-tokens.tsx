"use client";

import * as React from "react";
import { AA_TEXT_RATIO, contrastRatio, toHex, type Rgb } from "@/lib/contrast";
import { formatDecimal } from "@/lib/format";

/*
 * Reads the tokens as the browser resolves them in the theme shown (light, dark, system) and
 * measures the contrast of each text/background pair live, like the mockup's Foundation board.
 */

const SWATCHES: [token: string, name: string, use: string][] = [
  ["--brand", "Accent", "Boutons, liens, focus"],
  ["--brand-soft", "Accent doux", "Sélection, entretien"],
  ["--bg", "Fond", "Arrière-plan"],
  ["--surface", "Surface", "Cartes, feuilles"],
  ["--surface-2", "Surface 2", "Pistes, puces"],
  ["--border", "Bordure", "Séparateurs"],
  ["--fg", "Texte", "Texte principal"],
  ["--fg-muted", "Texte secondaire", "Légendes"],
  ["--ok", "À jour", "Barre d'usure"],
  ["--soon", "Bientôt", "Barre d'usure"],
  ["--late", "En retard", "Barre d'usure"],
];

const PAIRS: [label: string, fg: string, bg: string][] = [
  ["Texte sur fond", "--fg", "--bg"],
  ["Texte secondaire sur fond", "--fg-muted", "--bg"],
  ["Texte secondaire sur carte", "--fg-muted", "--surface"],
  ["Texte secondaire sur puce", "--fg-muted", "--surface-2"],
  ["Bouton principal", "--brand-fg", "--brand"],
  ["Lien sur carte", "--brand-ink", "--surface"],
  ["Sélection", "--brand-ink", "--brand-soft"],
  ["Badge « À jour »", "--ok-ink", "--ok-soft"],
  ["Badge « Bientôt »", "--soon-ink", "--soon-soft"],
  ["Badge « En retard »", "--late-ink", "--late-soft"],
  ["Badge « Stock bas »", "--fg", "--surface-2"],
  ["Texte secondaire sur sélection", "--fg-muted", "--brand-soft"],
  ["Toast", "--toast-fg", "--toast-bg"],
  ["Action du toast", "--toast-action", "--toast-bg"],
];

let reader: ((token: string, over?: Rgb) => Rgb) | null = null;

/** Resolves a CSS custom property to sRGB through a 1 × 1 canvas (handles oklch). Browser only. */
function readToken(token: string, over?: Rgb): Rgb {
  if (!reader) {
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.append(probe);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    reader = (name, background) => {
      probe.style.color = `var(${name})`;
      const colour = getComputedStyle(probe).color;
      if (!ctx) return [0, 0, 0];
      ctx.clearRect(0, 0, 1, 1);
      // A translucent colour is measured over what it sits on.
      ctx.fillStyle = background ? `rgb(${background.join(" ")})` : "#000";
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    };
  }
  return reader(token, over);
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/** Changes whenever the theme shown changes (system setting or data-theme); null on the server. */
function useThemeKey(): string | null {
  return React.useSyncExternalStore(
    subscribe,
    () =>
      `${window.matchMedia("(prefers-color-scheme: dark)").matches}|${document.documentElement.dataset.theme ?? ""}`,
    () => null,
  );
}

export function Swatches() {
  const theme = useThemeKey();
  const hexes = React.useMemo(
    () => (theme ? SWATCHES.map(([token]) => toHex(readToken(token))) : null),
    [theme],
  );
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
      {SWATCHES.map(([token, name, use], index) => (
        <div key={token} className="grid min-w-0 gap-[5px]">
          <div
            className="h-[54px] rounded-[10px] border border-border"
            style={{ background: `var(${token})` }}
          />
          <p className="text-[13.5px] font-semibold">{name}</p>
          <p className="font-mono text-xs leading-snug [overflow-wrap:anywhere] text-fg-muted">
            {token} · {hexes?.[index] ?? "…"}
            <br />
            {use}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ContrastTable() {
  const theme = useThemeKey();
  const ratios = React.useMemo(() => {
    if (!theme) return null;
    return PAIRS.map(([, fg, bg]) => {
      const background = readToken(bg);
      return contrastRatio(readToken(fg, background), background);
    });
  }, [theme]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-[9px] [&>th]:text-left">
            <th className="eyebrow">Usage</th>
            <th className="eyebrow">Aperçu</th>
            <th className="text-right eyebrow">Ratio</th>
          </tr>
        </thead>
        <tbody>
          {PAIRS.map(([label, fg, bg], index) => {
            const ratio = ratios?.[index];
            const pass = ratio != null && ratio >= AA_TEXT_RATIO;
            return (
              <tr
                key={label}
                className="[&>td]:border-b [&>td]:border-border [&>td]:px-2 [&>td]:py-[9px]"
              >
                <td>{label}</td>
                <td>
                  <span
                    className="inline-flex h-7 items-center rounded-[7px] px-2.5 text-[13px] font-semibold whitespace-nowrap"
                    style={{ color: `var(${fg})`, background: `var(${bg})` }}
                  >
                    Aa 2&#8239;846
                  </span>
                </td>
                <td className="text-right whitespace-nowrap tabular-nums">
                  {ratio == null ? (
                    "…"
                  ) : (
                    <>
                      {formatDecimal(ratio, 1)}:1{" "}
                      <span
                        className={
                          pass ? "font-semibold text-ok-ink" : "font-semibold text-late-ink"
                        }
                      >
                        {pass ? "✓ AA" : "✗ sous AA"}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
