import { formatItemStock, formatStock } from "./display";
import type { InventoryCategory, InventoryKind } from "./enums";
import type {
  BikeRef,
  InventoryItemVM,
  ProcedureLineVM,
  ProcedureRowVM,
  ProcedureVM,
} from "./view-models";

/*
 * What a procedure ("fiche", D-47, D-86) needs, read against the workshop for one bike: each line
 * ready, low or missing, in words, with what can be done about it. Pure: the server uses it for
 * the list's badge, the browser for the detail when "Préparer pour" changes the bike. Nothing
 * about availability is stored (docs/03).
 */

export type NeedAvailability = "ok" | "low" | "missing";

export type ProcedureNeed = {
  lineId: number;
  /** The detail groups lines as the mockup does: tools, wear parts, products, then the rest. */
  group: InventoryKind | "other";
  name: string;
  /** The workshop item the line resolves to, for this bike. */
  item: InventoryItemVM | null;
  /** Parts: units per job. */
  quantity: number | null;
  availability: NeedAvailability;
  /** "Possédé", "2 paires en stock", "Stock bas · presque vide", "Manquant", "Pas dans l'atelier". */
  text: string;
  /**
   * "add": not in the workshop yet ("Ajouter à l'atelier", prefilled); "order": to put on
   * "À commander". Null when nothing is to do, or a restocking is already under way.
   */
  action: "add" | "order" | null;
  prefill?: {
    kind?: InventoryKind;
    name: string;
    category?: InventoryCategory;
    componentTypeCode?: string;
  };
};

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const serves = (item: InventoryItemVM, bikeId: number | null) =>
  bikeId == null || item.bikes === "all" || item.bikes.some((bike) => bike.id === bikeId);

/** A workshop item against what one job needs. */
function itemNeed(
  line: ProcedureLineVM,
  item: InventoryItemVM,
  name: string = item.name,
): ProcedureNeed {
  const restocking = item.state === "to_order" || item.state === "ordered";
  const base = { lineId: line.id, group: item.kind, name, item, quantity: line.quantity };
  const missing = (text: string): ProcedureNeed => ({
    ...base,
    availability: "missing",
    text,
    action: restocking ? null : "order",
  });
  switch (item.kind) {
    case "tool":
      return item.owned
        ? { ...base, availability: "ok", text: "Possédé", action: null }
        : missing("Manquant");
    case "part": {
      const needed = line.quantity ?? 1;
      if (item.quantity < needed) {
        return missing(
          item.quantity > 0
            ? `Manquant · ${formatStock(item.quantity, item.unit)} en stock`
            : "Manquant",
        );
      }
      const inStock = `${formatStock(item.quantity, item.unit)} en stock`;
      return item.state === "low_stock"
        ? { ...base, availability: "low", text: `Stock bas · ${inStock}`, action: "order" }
        : { ...base, availability: "ok", text: capitalized(inStock), action: null };
    }
    case "product": {
      if (item.containers <= 0) return missing("Vide");
      const level = formatItemStock(item);
      return item.state === "low_stock"
        ? { ...base, availability: "low", text: `Stock bas · ${level}`, action: "order" }
        : { ...base, availability: "ok", text: capitalized(level), action: null };
    }
  }
}

/**
 * Each line of a procedure for a bike (null: any bike): a given item; the best part of the type
 * serving that bike (one with enough stock first); or a label, not in the workshop.
 */
export function procedureNeeds(
  lines: ProcedureLineVM[],
  items: InventoryItemVM[],
  bikeId: number | null,
): ProcedureNeed[] {
  return lines.map((line): ProcedureNeed => {
    if (line.target === "item") {
      const item = items.find((i) => i.id === line.itemId);
      return item
        ? itemNeed(line, item)
        : {
            lineId: line.id,
            group: "other",
            name: "Objet archivé",
            item: null,
            quantity: line.quantity,
            availability: "missing",
            text: "Plus dans l'atelier",
            action: null,
          };
    }
    if (line.target === "type") {
      const fitting = items.filter(
        (item): item is Extract<InventoryItemVM, { kind: "part" }> =>
          item.kind === "part" &&
          item.componentTypeCode === line.componentTypeCode &&
          serves(item, bikeId),
      );
      const needed = line.quantity ?? 1;
      const best = fitting.find((item) => item.quantity >= needed) ?? fitting[0];
      if (best) return itemNeed(line, best, `${line.typeLabel} · ${best.name}`);
      return {
        lineId: line.id,
        group: "part",
        name: line.typeLabel,
        item: null,
        quantity: line.quantity,
        availability: "missing",
        text: "Pas dans l'atelier",
        action: "add",
        prefill: { kind: "part", name: line.typeLabel, componentTypeCode: line.componentTypeCode },
      };
    }
    return {
      lineId: line.id,
      group: "other",
      name: line.label,
      item: null,
      quantity: line.quantity,
      availability: "missing",
      text: "Pas dans l'atelier",
      action: "add",
      prefill: { name: line.label },
    };
  });
}

export type Readiness = { missing: number; low: number; label: string } | null;

/** The one badge of a procedure: "2 manquants", "Stock bas", "Matériel prêt"; null without material. */
export function readinessOf(needs: ProcedureNeed[]): Readiness {
  if (!needs.length) return null;
  const missing = needs.filter((need) => need.availability === "missing").length;
  const low = needs.filter((need) => need.availability === "low").length;
  const label = missing
    ? `${missing} manquant${missing > 1 ? "s" : ""}`
    : low
      ? "Stock bas"
      : "Matériel prêt";
  return { missing, low, label };
}

/** Whether a procedure is for a bike: all bikes, or that one among its own. */
export function procedureServes(procedure: Pick<ProcedureVM, "bikes">, bikeId: number): boolean {
  return procedure.bikes === "all" || procedure.bikes.some((bike) => bike.id === bikeId);
}

/** Accents and case ignored: "etrier" finds "Étrier". */
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Search (D-86): title, description, model, type, steps and material. */
export function procedureMatches(
  procedure: ProcedureVM,
  query: string,
  items: Pick<InventoryItemVM, "id" | "name">[],
): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const words = [
    procedure.title,
    procedure.description,
    procedure.modelHint,
    procedure.typeLabel,
    ...procedure.steps.flatMap((step) => [step.instruction, step.note]),
    ...procedure.lines.map((line) =>
      line.target === "item"
        ? (items.find((item) => item.id === line.itemId)?.name ?? "")
        : line.target === "type"
          ? line.typeLabel
          : line.label,
    ),
  ];
  return normalize(words.filter(Boolean).join(" ")).includes(q);
}

/**
 * A row of a list of procedures, its material read for one bike: the bike page's (that bike), or
 * the first one it serves.
 */
export function procedureRow(
  procedure: ProcedureVM,
  items: InventoryItemVM[],
  bikeId: number | null,
  bikes: BikeRef[],
): ProcedureRowVM {
  const served = procedure.bikes === "all" ? bikes : procedure.bikes;
  const forBike =
    bikeId != null && procedureServes(procedure, bikeId)
      ? (bikes.find((bike) => bike.id === bikeId) ?? null)
      : (served[0] ?? null);
  return {
    id: procedure.id,
    title: procedure.title,
    stepCount: procedure.steps.length,
    estimatedDurationS: procedure.estimatedDurationS,
    bikes: procedure.bikes,
    readiness: readinessOf(procedureNeeds(procedure.lines, items, forBike?.id ?? null)),
    forBike: served.length > 1 && forBike ? forBike.name : null,
  };
}
