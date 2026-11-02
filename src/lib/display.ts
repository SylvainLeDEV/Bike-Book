/**
 * Display texts built from view models: the small sentences and lines the screens repeat
 * (a rule's note, a ride's figures). Pure, French, tested.
 */
import {
  formatCount,
  formatDate,
  formatDays,
  formatDistance,
  formatDuration,
  formatElevation,
  formatEta,
  formatMoney,
  type LocalDate,
} from "./format";
import type { ComponentPosition, ComponentTypeCode, InventoryKind } from "./enums";
import {
  COMPONENT_TYPE_AGREEMENT,
  COMPONENT_TYPE_LABELS,
  CONTAINER_SUGGESTIONS,
  MOVEMENT_LABELS,
  POSITION_LABELS,
  PRODUCT_LEVEL_LABELS,
  UNIT_LABELS,
} from "./labels";
import type {
  ContainerWords,
  InventoryUnit,
  ItemStockVM,
  MovementVM,
  Quantity,
  RideItemVM,
  RuleRowVM,
} from "./view-models";

export function formatQuantity(quantity: Quantity): string {
  switch (quantity.unit) {
    case "distance_m":
      return formatDistance(quantity.value);
    case "duration_s":
      return formatDuration(quantity.value);
    case "days":
      return formatDays(quantity.value);
  }
}

/** "1 paire", "2 pièces". */
export function formatStock(quantity: number, unit: InventoryUnit): string {
  const [one, many] = UNIT_LABELS[unit];
  return formatCount(quantity, one, many);
}

/**
 * A product's container in words, from the name typed (D-85): "flacon" / "flacons",
 * "seau" / "seaux", "pot à graisse" / "pots à graisse"; "flacon" when none was typed.
 */
export function containerWords(label: string | null | undefined): ContainerWords {
  const one = label?.trim().replace(/\s+/g, " ").toLowerCase() || CONTAINER_SUGGESTIONS[0];
  const [head, ...rest] = one.split(" ");
  const heads = /[sxz]$/.test(head) ? head : /(eau|au|eu)$/.test(head) ? `${head}x` : `${head}s`;
  return [one, [heads, ...rest].join(" ")];
}

/**
 * What an item holds, in words: "2 paires"; "presque vide", "entamé · 2 flacons", "vide";
 * "possédé", "non possédé".
 */
export function formatItemStock(stock: ItemStockVM): string {
  switch (stock.kind) {
    case "part":
      return formatStock(stock.quantity, stock.unit);
    case "product": {
      if (stock.containers <= 0) return PRODUCT_LEVEL_LABELS.empty.toLowerCase();
      const level = PRODUCT_LEVEL_LABELS[stock.level].toLowerCase();
      if (stock.containers === 1) return level;
      const [one, many] = stock.container;
      return `${level} · ${formatCount(stock.containers, one, many)}`;
    }
    case "tool":
      return stock.owned ? "possédé" : "non possédé";
  }
}

/**
 * A movement's title in an item's history: "Achat", "Utilisation"; for a product "Niveau :
 * presque vide", "Vide · 1 flacon en moins" or "1 flacon en moins" (D-85), worded so that a
 * feminine container ("bombe") reads right too; for a tool "Dans l'atelier", "Plus dans
 * l'atelier".
 */
export function movementTitle(
  kind: InventoryKind,
  movement: Pick<MovementVM, "kind" | "quantityDelta" | "levelAfter">,
  container: ContainerWords = containerWords(null),
): string {
  if (kind === "product" && movement.kind !== "initial" && movement.kind !== "purchase") {
    if (movement.quantityDelta === 0 && movement.levelAfter) {
      return `Niveau : ${PRODUCT_LEVEL_LABELS[movement.levelAfter].toLowerCase()}`;
    }
    if (movement.kind === "use" && movement.quantityDelta < 0) {
      const fewer = `${formatCount(-movement.quantityDelta, ...container)} en moins`;
      return movement.levelAfter ? `Vide · ${fewer}` : fewer;
    }
  }
  if (kind === "tool" && movement.kind === "adjustment") {
    return movement.quantityDelta > 0 ? "Dans l'atelier" : "Plus dans l'atelier";
  }
  return MOVEMENT_LABELS[movement.kind];
}

/**
 * The line under a rule's wear bar: how far past due, the due date, or the projection.
 * "Dépassé de 6 h 20", "Le 1er novembre", "≈ dans 5 jours".
 */
export function ruleNote(rule: RuleRowVM, today: LocalDate): string | null {
  if (rule.status === "overdue") {
    const over: Quantity = {
      unit: rule.used.unit,
      value: Math.max(0, rule.used.value - rule.interval.value),
    } as Quantity;
    return `Dépassé de ${formatQuantity(over)}`;
  }
  if (rule.dueOn) {
    return `Le ${formatDate(rule.dueOn, { year: "auto", today })}`;
  }
  if (rule.etaDays != null) return formatEta(rule.etaDays);
  return null;
}

/** "38 km · 3 h 40 · 1 620 m D+", or for a bike park day "14 descentes · 6 h au total". */
export function rideFigures(ride: RideItemVM): string {
  const parts: string[] = [];
  if (ride.rideType === "bike_park" && ride.runsCount != null) {
    parts.push(formatCount(ride.runsCount, "descente", "descentes"));
    if (ride.totalTimeS != null) parts.push(`${formatDuration(ride.totalTimeS)} au total`);
    return parts.join(" · ");
  }
  if (ride.distanceM != null) parts.push(formatDistance(ride.distanceM));
  if (ride.durationS != null) parts.push(formatDuration(ride.durationS));
  if (ride.elevationGainM != null) parts.push(`${formatElevation(ride.elevationGainM)} D+`);
  return parts.join(" · ");
}

export function maintenanceFigures(costCents: number | null, performedBy: "self" | "shop"): string {
  const cost = costCents != null ? formatMoney(costCents) : null;
  const who = performedBy === "self" ? "fait maison" : null;
  return [cost, who].filter(Boolean).join(" · ");
}

/** Bikes an item serves, in words: "Tous les vélos", "Spectral · Le Lourd", "3 vélos". */
export function bikesText(bikes: { name: string }[] | "all"): string {
  if (bikes === "all") return "Tous les vélos";
  if (bikes.length === 0) return "Aucun vélo";
  if (bikes.length > 2) return `${bikes.length} vélos`;
  return bikes.map((bike) => bike.name).join(" · ");
}

/** Initials for the avatar: "Camille Martin" → "CM". */
export function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "");
  return (letters.length > 1 ? letters[0] + letters[letters.length - 1] : letters[0]) || "?";
}

/** The frame number masked except its last group: "•••• •••• 8K41". */
export function maskSerial(serial: string): string {
  const groups = serial.trim().split(/\s+/);
  return groups
    .map((group, i) => (i < groups.length - 1 ? "•".repeat(group.length) : group))
    .join(" ");
}

/** The last group of a frame number, for the masked version read aloud. */
export function serialEnd(serial: string): string {
  return serial.trim().split(/\s+/).pop() ?? "";
}

/** "Pneu avant", "Plaquettes arrière", "Chaîne": a slot in words. */
export function slotLabel(typeCode: ComponentTypeCode, position: ComponentPosition): string {
  const label = typeCode === "other" ? "Pièce" : COMPONENT_TYPE_LABELS[typeCode];
  return position === "none" ? label : `${label} ${POSITION_LABELS[position]}`;
}

/** A past participle agreed with the part: agreed("chain", "monté") → "montée". */
export function agreed(typeCode: ComponentTypeCode, participle: string): string {
  const ending = { m: "", f: "e", mp: "s", fp: "es" }[COMPONENT_TYPE_AGREEMENT[typeCode]];
  return participle + ending;
}

/** "Chaîne remplacée", "Pneu avant remplacé", "Plaquettes arrière remplacées". */
export function replacedTitle(typeCode: ComponentTypeCode, position: ComponentPosition): string {
  return `${slotLabel(typeCode, position)} ${agreed(typeCode, "remplacé")}`;
}
