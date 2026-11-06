import { describe, expect, it } from "vitest";
import {
  bikesText,
  containerWords,
  formatItemStock,
  formatQuantity,
  formatStock,
  formatTorque,
  movementTitle,
  initialsOf,
  maskSerial,
  rideFigures,
  ruleNote,
  serialEnd,
  agreed,
  replacedTitle,
  slotLabel,
} from "./display";
import { NBSP, NNBSP } from "./format";
import type { RideItemVM, RuleRowVM } from "./view-models";

const fr = (text: string) => text.replaceAll("_", NNBSP).replaceAll("~", NBSP);
const bike = { id: 1, name: "Spectral", cover: { photoUrl: null, artIndex: 0 } };

const rule = (overrides: Partial<RuleRowVM>): RuleRowVM => ({
  id: 1,
  bike,
  slot: null,
  title: "Règle",
  status: "ok",
  ratio: 0.5,
  warnRatio: 0.9,
  used: { unit: "duration_s", value: 25 * 3600 },
  interval: { unit: "duration_s", value: 50 * 3600 },
  dueOn: null,
  etaDays: null,
  lastDoneOn: null,
  stock: null,
  ...overrides,
});

describe("ruleNote", () => {
  it("says how far past due an overdue rule is", () => {
    const late = rule({
      status: "overdue",
      used: { unit: "duration_s", value: 56 * 3600 + 20 * 60 },
    });
    expect(ruleNote(late, "2026-10-25")).toBe(fr("Dépassé de 6_h_20"));
  });

  it("gives the due date of a day-based rule", () => {
    const sealant = rule({ status: "due_soon", dueOn: "2026-11-01" });
    expect(ruleNote(sealant, "2026-10-25")).toBe(fr("Le 1er~novembre"));
    expect(ruleNote(rule({ dueOn: "2027-09-26" }), "2026-10-25")).toBe(fr("Le 26~septembre~2027"));
  });

  it("gives the day a snoozed rule comes back (D-105)", () => {
    const snoozed = rule({ status: "snoozed", dueOn: "2026-07-24", snoozeEndsOn: "2027-01-15" });
    expect(ruleNote(snoozed, "2026-11-06")).toBe(fr("Reporté jusqu'au 15~janvier~2027"));
    expect(ruleNote({ ...snoozed, snoozeEndsOn: "2026-12-01" }, "2026-11-06")).toBe(
      fr("Reporté jusqu'au 1er~décembre"),
    );
  });

  it("falls back on the projection, then on nothing", () => {
    expect(ruleNote(rule({ etaDays: 5 }), "2026-10-25")).toBe(fr("≈~dans 5~jours"));
    expect(ruleNote(rule({}), "2026-10-25")).toBeNull();
  });
});

describe("rideFigures", () => {
  const ride: RideItemVM = {
    kind: "ride",
    id: 1,
    on: "2026-10-24",
    bikeName: "Spectral",
    rideType: "enduro",
    title: "Massif des Bauges",
    distanceM: 38_000,
    durationS: 3 * 3600 + 40 * 60,
    totalTimeS: null,
    elevationGainM: 1620,
    runsCount: null,
    wearS: null,
    conditions: "mud",
    photos: [],
    documents: [],
  };

  it("lists distance, time and climbing", () => {
    expect(rideFigures(ride)).toBe(fr("38~km · 3_h_40 · 1_620~m D+"));
  });

  it("counts runs and the whole day on bike park days", () => {
    const park: RideItemVM = {
      ...ride,
      rideType: "bike_park",
      runsCount: 14,
      totalTimeS: 6 * 3600,
      distanceM: null,
    };
    expect(rideFigures(park)).toBe(fr("14~descentes · 6~h au total"));
  });
});

describe("small helpers", () => {
  it("formats quantities and stock", () => {
    expect(formatQuantity({ unit: "distance_m", value: 462_000 })).toBe(fr("462~km"));
    expect(formatQuantity({ unit: "days", value: 83 })).toBe(fr("83~j"));
    expect(formatStock(1, "pair")).toBe(fr("1~paire"));
    expect(formatStock(2, "piece")).toBe(fr("2~pièces"));
  });

  it("names the bikes an item serves", () => {
    expect(bikesText("all")).toBe("Tous les vélos");
    expect(bikesText([])).toBe("Aucun vélo");
    expect(bikesText([bike, { name: "Le Lourd" }])).toBe("Spectral · Le Lourd");
    expect(bikesText([bike, bike, bike])).toBe("3 vélos");
  });

  it("masks the frame number except its last group", () => {
    expect(maskSerial("CN24 7Q3M 8K41")).toBe("•••• •••• 8K41");
    expect(serialEnd("CN24 7Q3M 8K41")).toBe("8K41");
    expect(maskSerial("WSBC123")).toBe("WSBC123");
  });

  it("builds avatar initials", () => {
    expect(initialsOf("Camille Martin")).toBe("CM");
    expect(initialsOf("camille")).toBe("C");
    expect(initialsOf("Jean Paul Durand")).toBe("JD");
  });
});

describe("slots in words", () => {
  it("names a slot with its position", () => {
    expect(slotLabel("tire", "front")).toBe("Pneu avant");
    expect(slotLabel("brake_pads", "rear")).toBe("Plaquettes arrière");
    expect(slotLabel("chain", "none")).toBe("Chaîne");
    expect(slotLabel("other", "none")).toBe("Pièce");
  });

  it("agrees the participle with the part", () => {
    expect(replacedTitle("chain", "none")).toBe("Chaîne remplacée");
    expect(replacedTitle("tire", "rear")).toBe("Pneu arrière remplacé");
    expect(replacedTitle("brake_pads", "front")).toBe("Plaquettes avant remplacées");
    expect(replacedTitle("rear_derailleur", "none")).toBe("Dérailleur arrière remplacé");
    expect(agreed("tire", "ajouté")).toBe("ajouté");
    expect(agreed("grips", "monté")).toBe("montées");
  });
});

describe("workshop stock in words (D-85)", () => {
  it("names a product's container, plural included", () => {
    expect(containerWords(null)).toEqual(["flacon", "flacons"]);
    expect(containerWords("  Bidon ")).toEqual(["bidon", "bidons"]);
    expect(containerWords("seau")).toEqual(["seau", "seaux"]);
    expect(containerWords("pot à graisse")).toEqual(["pot à graisse", "pots à graisse"]);
    expect(containerWords("tubes")).toEqual(["tubes", "tubes"]);
  });

  it("says what each kind holds", () => {
    const flacon = containerWords(null);
    expect(formatItemStock({ kind: "part", quantity: 2, unit: "pair" })).toBe(fr("2~paires"));
    expect(
      formatItemStock({ kind: "product", containers: 1, level: "low", container: flacon }),
    ).toBe("presque vide");
    expect(
      formatItemStock({ kind: "product", containers: 2, level: "started", container: flacon }),
    ).toBe(fr("entamé · 2~flacons"));
    expect(
      formatItemStock({ kind: "product", containers: 0, level: "empty", container: flacon }),
    ).toBe("vide");
    expect(formatItemStock({ kind: "tool", owned: true })).toBe("possédé");
    expect(formatItemStock({ kind: "tool", owned: false })).toBe("non possédé");
  });

  it("titles a movement by the item's kind", () => {
    const bombe = containerWords("bombe");
    expect(movementTitle("part", { kind: "use", quantityDelta: -1 })).toBe("Utilisation");
    expect(
      movementTitle("product", { kind: "use", quantityDelta: 0, levelAfter: "low" }, bombe),
    ).toBe("Niveau : presque vide");
    expect(
      movementTitle("product", { kind: "adjustment", quantityDelta: 0, levelAfter: "full" }),
    ).toBe("Niveau : plein");
    expect(
      movementTitle("product", { kind: "use", quantityDelta: -1, levelAfter: "full" }, bombe),
    ).toBe(fr("Vide · 1~bombe en moins"));
    expect(
      movementTitle("product", { kind: "use", quantityDelta: -1, levelAfter: null }, bombe),
    ).toBe(fr("1~bombe en moins"));
    expect(movementTitle("product", { kind: "purchase", quantityDelta: 1 })).toBe("Achat");
    expect(movementTitle("tool", { kind: "adjustment", quantityDelta: 1 })).toBe("Dans l'atelier");
    expect(movementTitle("tool", { kind: "adjustment", quantityDelta: -1 })).toBe(
      "Plus dans l'atelier",
    );
  });
});

describe("formatTorque", () => {
  it("keeps the decimals a manual prints", () => {
    expect(formatTorque(6.8)).toBe(fr("6,8~N·m"));
    expect(formatTorque(25)).toBe(fr("25~N·m"));
    expect(formatTorque(6.75)).toBe(fr("6,75~N·m"));
  });
});
