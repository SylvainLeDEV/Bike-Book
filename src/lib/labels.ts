/**
 * French labels for the enum values (H-01). The values themselves stay in English, as in the
 * database and docs/03 (D-50): labels exist only in the interface.
 */
import type {
  BikeStatus,
  ComponentGroup,
  ComponentOrigin,
  ComponentTypeCode,
  Discipline,
  EvidenceLevel,
  InventoryCategory,
  InventoryUnit,
  MaintenanceAction,
  MovementKind,
  RemovalReason,
  RideConditions,
  RideType,
  RuleStatus,
  ShopKind,
  TemplateSource,
  WheelSize,
} from "./enums";
import type { RebuyState } from "./view-models";

/** Disciplines in the order of the bike sheet's list. */
export const DISCIPLINE_ORDER: Discipline[] = [
  "trail",
  "enduro",
  "dh",
  "xc",
  "gravel",
  "road",
  "dirt",
  "city",
  "other",
];

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

export const WHEEL_SIZE_LABELS: Record<WheelSize, string> = {
  "29": "29 pouces",
  "27.5": "27,5 pouces",
  "26": "26 pouces",
  mullet: "Mulet (29 / 27,5)",
  "700c": "700c",
  "650b": "650b",
  other: "Autre",
};

export const SHOP_KIND_LABELS: Record<ShopKind, string> = {
  physical: "En magasin",
  online: "En ligne",
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

export const COMPONENT_TYPE_LABELS: Record<ComponentTypeCode, string> = {
  fork: "Fourche",
  rear_shock: "Amortisseur",
  chain: "Chaîne",
  cassette: "Cassette",
  chainring: "Plateau",
  crankset: "Pédalier",
  bottom_bracket: "Boîtier de pédalier",
  rear_derailleur: "Dérailleur arrière",
  shifter: "Commande de vitesses",
  pedals: "Pédales",
  brake: "Frein",
  brake_pads: "Plaquettes",
  rotor: "Disque",
  wheel: "Roue",
  tire: "Pneu",
  hub_bearings: "Roulements de moyeu",
  handlebar: "Cintre",
  stem: "Potence",
  grips: "Poignées",
  saddle: "Selle",
  dropper_post: "Tige de selle télescopique",
  frame: "Cadre",
  headset: "Jeu de direction",
  frame_bearings: "Roulements de cadre",
  motor: "Moteur",
  battery: "Batterie",
  display: "Écran",
  other: "Autre",
};

/** Grammatical gender and number of each type's label, for "Chaîne remplacée" (f: feminine). */
export const COMPONENT_TYPE_AGREEMENT: Record<ComponentTypeCode, "m" | "f" | "mp" | "fp"> = {
  fork: "f",
  rear_shock: "m",
  chain: "f",
  cassette: "f",
  chainring: "m",
  crankset: "m",
  bottom_bracket: "m",
  rear_derailleur: "m",
  shifter: "f",
  pedals: "fp",
  brake: "m",
  brake_pads: "fp",
  rotor: "m",
  wheel: "f",
  tire: "m",
  hub_bearings: "mp",
  handlebar: "m",
  stem: "f",
  grips: "fp",
  saddle: "f",
  dropper_post: "f",
  frame: "m",
  headset: "m",
  frame_bearings: "mp",
  motor: "m",
  battery: "f",
  display: "m",
  other: "f",
};

export const POSITION_LABELS: Record<"front" | "rear", string> = {
  front: "avant",
  rear: "arrière",
};

export const COMPONENT_ORIGIN_LABELS: Record<ComponentOrigin, string> = {
  stock: "D'origine",
  replacement: "Remplacement",
  upgrade: "Ajoutée ou améliorée",
};

export const MAINTENANCE_ACTION_LABELS: Record<MaintenanceAction, string> = {
  replaced: "Remplacé",
  serviced: "Entretenu",
  inspected: "Contrôlé",
  adjusted: "Réglé",
  cleaned: "Nettoyé",
  lubricated: "Lubrifié",
  bled: "Purgé",
  trued: "Dévoilé",
  other: "Autre",
};

export const TEMPLATE_SOURCE_LABELS: Record<TemplateSource, string> = {
  manufacturer: "Constructeur",
  common_practice: "Usage courant",
  personal: "Personnel",
};

export const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  verified: "Vérifié",
  secondary: "Source secondaire",
  unverified: "Non vérifié",
  estimate: "Estimation",
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
