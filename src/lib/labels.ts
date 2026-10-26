/**
 * French labels for the enum values (H-01). The values themselves stay in English, as in the
 * database and docs/03 (D-50): labels exist only in the interface.
 */
import type {
  BikeStatus,
  ComponentGroup,
  Discipline,
  InventoryCategory,
  InventoryUnit,
  MovementKind,
  RebuyState,
  RemovalReason,
  RideConditions,
  RideType,
  RuleStatus,
} from "./view-models";

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  road: "Route",
  gravel: "Gravel",
  xc: "XC",
  trail: "Trail",
  enduro: "Enduro",
  dh: "DH",
  dirt: "Dirt",
  city: "Ville",
  other: "Autre",
};

export const RIDE_TYPE_LABELS: Record<RideType, string> = {
  trail: "Trail",
  enduro: "Enduro",
  bike_park: "Bike park",
  dh: "DH",
  xc: "XC",
  gravel: "Gravel",
  road: "Route",
  commute: "Vélotaf",
  indoor: "Home trainer",
  other: "Autre",
};

/** Order of the ride type chips in the quick entry. */
export const RIDE_TYPE_ORDER: RideType[] = [
  "trail",
  "enduro",
  "bike_park",
  "dh",
  "xc",
  "gravel",
  "road",
  "commute",
  "indoor",
  "other",
];

export const CONDITIONS_LABELS: Record<RideConditions, string> = {
  dry: "Sec",
  wet: "Humide",
  mud: "Boue",
  dust: "Poussière",
  snow: "Neige",
  mixed: "Mixte",
};

export const RULE_STATUS_LABELS: Record<RuleStatus, string> = {
  ok: "À jour",
  due_soon: "Bientôt",
  overdue: "En retard",
  snoozed: "En pause",
};

export const BIKE_STATUS_LABELS: Record<BikeStatus, string> = {
  active: "Actif",
  stored: "Rangé",
  sold: "Vendu",
  stolen: "Volé",
  retired: "Retiré",
};

/** What each status does, in one line (D-43). */
export const BIKE_STATUS_EFFECTS: Record<BikeStatus, string> = {
  active: "Le vélo apparaît partout et ses règles d'entretien tournent.",
  stored: "Le vélo reste visible, ses règles au kilomètre et à l'heure ne bougent plus.",
  sold: "Le prix de vente est déduit du coût total ; le vélo quitte les listes.",
  stolen: "Le vélo quitte les listes ; son dossier reste prêt pour la déclaration.",
  retired: "Le vélo quitte les listes ; son historique reste consultable.",
};

export const COMPONENT_GROUP_LABELS: Record<ComponentGroup, string> = {
  suspension: "Suspension",
  drivetrain: "Transmission",
  brakes: "Freins",
  wheels: "Roues et pneus",
  cockpit: "Poste de pilotage",
  frame: "Cadre",
  electric: "Assistance électrique",
  other: "Autre",
};

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  ...COMPONENT_GROUP_LABELS,
  care: "Entretien courant",
  other: "Général",
};

export const REMOVAL_REASON_LABELS: Record<RemovalReason, string> = {
  worn: "Usure",
  broken: "Casse",
  crash: "Chute",
  upgrade: "Amélioration",
  sold_with_bike: "Vendue avec le vélo",
  other: "Autre",
};

/** The reason as the person picks it in the replace sheet. */
export const REMOVAL_REASON_CHOICES: Record<Exclude<RemovalReason, "sold_with_bike">, string> = {
  worn: "Usée",
  broken: "Cassée",
  crash: "Chute",
  upgrade: "Amélioration",
  other: "Autre",
};

export const UNIT_LABELS: Record<InventoryUnit, [one: string, many: string]> = {
  piece: ["pièce", "pièces"],
  pair: ["paire", "paires"],
  set: ["lot", "lots"],
};

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  initial: "Stock initial",
  purchase: "Achat",
  use: "Utilisation",
  adjustment: "Correction",
};

export const REBUY_STATE_LABELS: Record<RebuyState, string> = {
  to_order: "À commander",
  ordered: "En commande",
  low_stock: "Stock bas",
};
