/**
 * The "Conseils" of the setup tab (D-79, D-81, D-83): short "symptom → what to do" lines, the sag
 * targets and how to measure the sag, taken from the manufacturer's own documents only. Each row
 * names its sources, read on the date given. A model's own guide wins over these general figures:
 * they come from FOX documents, and another brand's guide may say otherwise.
 *
 * Not built yet: a model's own starting values (pressure by rider weight, clicks by pressure),
 * which the FOX guides give per model.
 */
import type { DamperAdjuster, SpringType, SuspensionTypeCode } from "./enums";
import type { LocalDate } from "./format";

export type AdviceSourceId =
  "fox_40_2019" | "fox_40_rc2_2009" | "fox_float_x2_2020" | "fox_coil_2023";

export type AdviceSource = {
  /** "FOX 40 (2019)". */
  short: string;
  title: string;
  url: string;
  /** The day the advice below was checked against the document. */
  verifiedOn: LocalDate;
};

export const ADVICE_SOURCES: Record<AdviceSourceId, AdviceSource> = {
  fox_40_2019: {
    short: "FOX 40 (2019)",
    title: "FOX, guide de réglage de la fourche 40 (605-00-218 rév. A, 2019)",
    url: "https://cdn.shopify.com/s/files/1/0904/4132/files/605-00-218_RevA-40-Tuning-Guide.pdf",
    verifiedOn: "2026-11-01",
  },
  fox_40_rc2_2009: {
    short: "FOX 40 RC2 (2009)",
    title: "FOX, manuel de la fourche 40 RC2 (2009)",
    url: "https://tech.ridefox.com/fox_tech_center/owners_manuals/09/Eng/Content/Forks/40/40.htm",
    verifiedOn: "2026-11-01",
  },
  fox_float_x2_2020: {
    short: "FOX FLOAT X2 (2020)",
    title: "FOX, guide de réglage de l'amortisseur FLOAT X2 (605-00-253 rév. A, 2020)",
    url: "https://www.transitionbikes.com/SupportFiles/605-00-253-FLOAT-X2-Tuning-Guide-revA.pdf",
    verifiedOn: "2026-11-01",
  },
  fox_coil_2023: {
    short: "FOX DHX2 (2023)",
    title: "FOX, manuel 2023 des amortisseurs à ressort (DHX2 et DHX)",
    url: "https://tech.ridefox.com/bike/owners-manuals/2832/shock--2023-all-coil-shocks-(dhx2-and-dhx-models)",
    verifiedOn: "2026-11-01",
  },
};

/** How clicks are counted, shown next to every click count (the "i"). */
export const CLICKS_CONVENTION =
  "Clics comptés depuis fermé : tourne la molette dans le sens horaire jusqu'à la butée (0 clic), puis compte les clics en l'ouvrant, dans le sens antihoraire. C'est la façon de compter des guides FOX.";

/** The sag to aim for, in percent of the part's own travel (a shock's stroke). */
export type SagTarget = { minPercent: number; maxPercent: number; source: AdviceSourceId };

/**
 * FOX 40 guide: 15–20 % of the fork's travel. FLOAT X2 guide: 25–30 % of the shock's stroke.
 * 2023 coil shocks manual: about 30 %.
 */
export function sagTargetOf(
  typeCode: SuspensionTypeCode,
  springType: SpringType | null,
): SagTarget {
  if (typeCode === "fork") return { minPercent: 15, maxPercent: 20, source: "fox_40_2019" };
  return springType === "coil"
    ? { minPercent: 30, maxPercent: 30, source: "fox_coil_2023" }
    : { minPercent: 25, maxPercent: 30, source: "fox_float_x2_2020" };
}

/** The steps of the "i" next to the sag: what to measure, and how. */
export function sagHowTo(typeCode: SuspensionTypeCode): string[] {
  return [
    ...(typeCode === "fork" ? ["Ouvre à fond la molette de compression basse vitesse (LSC)."] : []),
    typeCode === "fork"
      ? "Pousse le joint torique du plongeur contre le joint racleur."
      : "Pousse le joint torique de la tige de l'amortisseur contre son joint racleur.",
    "Monte sur le vélo avec ton équipement, en position de pilotage, sans bouger : appuie-toi contre un mur.",
    "Descends sans faire rebondir le vélo.",
    `Mesure entre le joint torique et le joint racleur : c'est ton SAG, en mm. L'app le compare ${typeCode === "fork" ? "au débattement" : "à la course de l'amortisseur"}.`,
  ];
}

/** "Symptom → what to do", or a plain line when `then` is absent. */
export type AdviceLine = { when: string; then?: string };

export type AdviceRow = {
  topic: string;
  lines: AdviceLine[];
  sources: AdviceSourceId[];
  /** Shown only for these springs (an unknown spring counts as air). */
  springTypes?: SpringType[];
  /** Shown only when the part has one of these adjusters (always when they are unknown). */
  adjusters?: DamperAdjuster[];
};

const AIR_SAG: AdviceRow = {
  topic: "SAG",
  lines: [
    { when: "Trop de SAG", then: "plus de pression" },
    { when: "Pas assez", then: "moins de pression" },
  ],
  sources: ["fox_40_2019", "fox_float_x2_2020"],
  springTypes: ["air"],
};

const TOKENS = (part: string): AdviceRow => ({
  topic: "Tokens",
  lines: [
    { when: `${part} talonne avec un bon SAG`, then: "ajoute un token" },
    { when: "Tu n'utilises pas tout le débattement", then: "enlève un token" },
  ],
  sources: ["fox_40_2019", "fox_float_x2_2020"],
  springTypes: ["air"],
});

export const SETUP_ADVICE: Record<SuspensionTypeCode, AdviceRow[]> = {
  fork: [
    AIR_SAG,
    {
      topic: "Rebond",
      lines: [
        { when: "La roue rebondit, peu d'adhérence", then: "ferme" },
        { when: "La fourche s'enfonce et devient dure", then: "ouvre" },
      ],
      sources: ["fox_40_rc2_2009"],
    },
    {
      topic: "LSC",
      lines: [
        { when: "Plonge au freinage, flotte", then: "ferme" },
        { when: "Peu d'adhérence en terrain meuble", then: "ouvre" },
      ],
      sources: ["fox_40_rc2_2009"],
      adjusters: ["low_speed_compression"],
    },
    {
      topic: "HSC",
      lines: [
        { when: "Talonne sur les gros chocs", then: "ferme" },
        { when: "Dure, n'utilise pas tout le débattement", then: "ouvre" },
      ],
      sources: ["fox_40_rc2_2009"],
      adjusters: ["high_speed_compression"],
    },
    TOKENS("La fourche"),
  ],
  rear_shock: [
    AIR_SAG,
    {
      topic: "SAG",
      lines: [
        { when: "Précharge : 2 tours au plus" },
        { when: "Trop de SAG", then: "ressort plus dur" },
        { when: "Pas assez", then: "ressort plus souple" },
      ],
      sources: ["fox_coil_2023"],
      springTypes: ["coil"],
    },
    {
      topic: "Rebond",
      lines: [
        { when: "LSR : adhérence sur bosses de freinage, dévers, montées techniques" },
        { when: "HSR : revenir à temps entre deux gros chocs" },
      ],
      sources: ["fox_float_x2_2020", "fox_coil_2023"],
      adjusters: ["low_speed_rebound", "high_speed_rebound"],
    },
    {
      topic: "Compression",
      lines: [
        { when: "LSC : transferts de poids, compressions" },
        { when: "HSC : gros chocs, réceptions" },
      ],
      sources: ["fox_float_x2_2020", "fox_coil_2023"],
      adjusters: ["low_speed_compression", "high_speed_compression"],
    },
    TOKENS("L'amortisseur"),
  ],
};

/** The rows that apply to a part, given its spring and its adjusters. */
export function adviceFor(
  typeCode: SuspensionTypeCode,
  springType: SpringType | null,
  adjusters: DamperAdjuster[] | null,
): AdviceRow[] {
  return SETUP_ADVICE[typeCode].filter(
    (row) =>
      (!row.springTypes || row.springTypes.includes(springType ?? "air")) &&
      (!row.adjusters ||
        adjusters == null ||
        adjusters.length === 0 ||
        row.adjusters.some((a) => adjusters.includes(a))),
  );
}
