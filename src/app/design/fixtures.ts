/*
 * Fictitious data for the /design route (D-22), consistent with the validated mockup: today is
 * Sunday 25 October 2026; the demo owner is Camille Martin, garage "Mon garage". Units and enum
 * values follow docs/03 (D-50), so these fixtures read like what the real pages will receive.
 *
 * Phase 1 only: the workshop holds parts (products and tools come in 1.5, D-33), and no
 * procedure or photo label appears (D-45, D-47).
 */
import type {
  BikePageVM,
  ComponentTypeOption,
  BikeRef,
  DashboardVM,
  InventoryItemVM,
  PhotoVM,
  QuickRideVM,
  ReplacePartVM,
  RuleRowVM,
  ShellUserVM,
  TaskRowVM,
  TimelineItemVM,
  WorkshopVM,
} from "@/lib/view-models";
import { photoArt } from "./photo-art";

export const TODAY = "2026-10-25";

const H = 3600;
const KM = 1000;

export const DEMO_USER: ShellUserVM = {
  name: "Camille Martin",
  email: "demo@example.com",
  workspaceName: "Mon garage",
};

// --- Bikes ---------------------------------------------------------------------------------------

export const SPECTRAL: BikeRef = {
  id: 1,
  name: "Spectral",
  cover: { photoUrl: null, artIndex: 0 },
};
export const LOURD: BikeRef = { id: 2, name: "Le Lourd", cover: { photoUrl: null, artIndex: 1 } };
export const GRAVEL: BikeRef = {
  id: 3,
  name: "Gravel alu",
  cover: { photoUrl: null, artIndex: 2 },
};
export const BIKES = [SPECTRAL, LOURD, GRAVEL];

// --- Rules and tasks ("À prévoir") ---------------------------------------------------------------

const lyrikRule: RuleRowVM = {
  id: 11,
  bike: SPECTRAL,
  slot: { group: "suspension", typeLabel: "Fourche", model: "RockShox Lyrik" },
  title: "Entretien des bas de fourreaux",
  status: "overdue",
  ratio: (56 * H + 20 * 60) / (50 * H),
  warnRatio: 0.9,
  used: { unit: "duration_s", value: 56 * H + 20 * 60 },
  interval: { unit: "duration_s", value: 50 * H },
  dueOn: null,
  etaDays: null,
  lastDoneOn: "2026-03-02",
  stock: { itemId: 105, name: "Kit joints Lyrik", quantity: 0, unit: "set", state: "to_order" },
};

const gravelChainRule: RuleRowVM = {
  id: 31,
  bike: GRAVEL,
  slot: { group: "drivetrain", typeLabel: "Chaîne", model: "Shimano CN-M8100" },
  title: "Contrôle d'usure de la chaîne",
  status: "due_soon",
  ratio: 462 / 500,
  warnRatio: 0.9,
  used: { unit: "distance_m", value: 462 * KM },
  interval: { unit: "distance_m", value: 500 * KM },
  dueOn: null,
  etaDays: 5,
  lastDoneOn: "2026-05-06",
  stock: { itemId: 103, name: "Chaîne CN-M8100", quantity: 0, unit: "piece", state: "ordered" },
};

const sealantRule: RuleRowVM = {
  id: 12,
  bike: SPECTRAL,
  slot: { group: "wheels", typeLabel: "Pneus tubeless", model: null },
  title: "Ajout de liquide préventif",
  status: "due_soon",
  ratio: 83 / 90,
  warnRatio: 0.9,
  used: { unit: "days", value: 83 },
  interval: { unit: "days", value: 90 },
  dueOn: "2026-11-01",
  etaDays: 7,
  lastDoneOn: "2026-08-03",
  stock: null,
};

const floatRule: RuleRowVM = {
  id: 21,
  bike: LOURD,
  slot: { group: "suspension", typeLabel: "Amortisseur", model: "Fox Float X" },
  title: "Entretien de la chambre à air",
  status: "due_soon",
  ratio: (45 * H + 30 * 60) / (50 * H),
  warnRatio: 0.9,
  used: { unit: "duration_s", value: 45 * H + 30 * 60 },
  interval: { unit: "duration_s", value: 50 * H },
  dueOn: null,
  etaDays: 15,
  lastDoneOn: "2025-11-08",
  stock: {
    itemId: 108,
    name: "Kit chambre à air Float X",
    quantity: 0,
    unit: "set",
    state: "to_order",
  },
};

const spectralChainRule: RuleRowVM = {
  id: 13,
  bike: SPECTRAL,
  slot: { group: "drivetrain", typeLabel: "Chaîne", model: "SRAM GX Eagle" },
  title: "Contrôle d'usure de la chaîne",
  status: "ok",
  ratio: 86 / 500,
  warnRatio: 0.9,
  used: { unit: "distance_m", value: 86 * KM },
  interval: { unit: "distance_m", value: 500 * KM },
  dueOn: null,
  etaDays: 61,
  lastDoneOn: "2026-10-12",
  stock: null,
};

const bleedRule: RuleRowVM = {
  id: 14,
  bike: SPECTRAL,
  slot: { group: "brakes", typeLabel: "Freins", model: "SRAM Maven" },
  title: "Purge des freins",
  status: "ok",
  ratio: 29 / 365,
  warnRatio: 0.9,
  used: { unit: "days", value: 29 },
  interval: { unit: "days", value: 365 },
  dueOn: "2027-09-26",
  etaDays: null,
  lastDoneOn: "2026-09-26",
  stock: null,
};

const pivotsTask: TaskRowVM = {
  id: 1,
  bike: SPECTRAL,
  title: "Vérifier le serrage des pivots",
  dueOn: "2026-10-31",
};
const truingTask: TaskRowVM = {
  id: 2,
  bike: GRAVEL,
  title: "Dévoiler la roue arrière",
  dueOn: null,
};

// --- Photos ----------------------------------------------------------------------------------------

type PhotoSeed = Omit<PhotoVM, "thumbUrl" | "url" | "bikeName"> & { art: string };

function photo(seed: PhotoSeed, bikeName = "Spectral"): PhotoVM {
  const { art, ...rest } = seed;
  return { ...rest, thumbUrl: art, url: art, bikeName };
}

const p = {
  firstRide: photo({
    id: 201,
    art: photoArt("land", [
      "oklch(0.8 0.07 245)",
      "oklch(0.9 0.06 70)",
      "oklch(0.55 0.06 260)",
      "oklch(0.34 0.04 265)",
      "oklch(0.97 0 0)",
    ]),
    caption: "Premier tour, au retour du Salève",
    alt: "Photo du Spectral",
    takenOn: "2024-04-02",
    origin: { kind: "bike", id: 1, title: "Spectral", on: null },
  }),
  serial: photo({
    id: 202,
    art: photoArt(
      "serial",
      [
        "oklch(0.36 0.03 260)",
        "oklch(0.26 0.03 265)",
        "oklch(0.45 0.05 255)",
        "oklch(0.22 0.02 260)",
        "oklch(0.86 0.01 250)",
      ],
      [1.08, -4, 0, 2],
    ),
    caption: "Numéro de cadre, sous le boîtier de pédalier",
    alt: "Photo du Spectral",
    takenOn: "2024-03-14",
    origin: { kind: "bike", id: 1, title: "Spectral", on: null },
  }),
  invoice: photo({
    id: 203,
    art: photoArt(
      "doc",
      [
        "oklch(0.72 0.03 70)",
        "oklch(0.62 0.04 60)",
        "oklch(0.55 0.02 250)",
        "oklch(0.45 0.03 250)",
        "oklch(0.55 0.12 30)",
      ],
      [1, -5, 0, 0],
    ),
    caption: "Facture d'achat, version papier",
    alt: "Photo du Spectral",
    takenOn: "2024-03-14",
    origin: { kind: "bike", id: 1, title: "Spectral", on: null },
  }),
  sealsBefore: photo({
    id: 204,
    art: photoArt(
      "fork",
      [
        "oklch(0.62 0.03 70)",
        "oklch(0.5 0.04 60)",
        "oklch(0.86 0.02 90)",
        "oklch(0.28 0.02 260)",
        "oklch(0.42 0.06 60)",
      ],
      [1.1, 3, -4, 0],
    ),
    caption: "Joints racleurs encrassés",
    alt: "Photo de l'entretien « Entretien fourche et amortisseur »",
    takenOn: "2026-03-02",
    origin: {
      kind: "maintenance_event",
      id: 5,
      title: "Entretien fourche et amortisseur",
      on: "2026-03-02",
    },
  }),
  sealsAfter: photo({
    id: 205,
    art: photoArt("fork", [
      "oklch(0.86 0.02 230)",
      "oklch(0.76 0.03 230)",
      "oklch(0.93 0.02 90)",
      "oklch(0.26 0.02 260)",
      "oklch(0.86 0.02 230)",
    ]),
    caption: "Bas de fourreaux nettoyés, joints neufs",
    alt: "Photo de l'entretien « Entretien fourche et amortisseur »",
    takenOn: "2026-03-02",
    origin: {
      kind: "maintenance_event",
      id: 5,
      title: "Entretien fourche et amortisseur",
      on: "2026-03-02",
    },
  }),
  chainGauge: photo({
    id: 206,
    art: photoArt(
      "chain",
      [
        "oklch(0.55 0.03 60)",
        "oklch(0.42 0.03 50)",
        "oklch(0.7 0.02 80)",
        "oklch(0.3 0.02 60)",
        "oklch(0.62 0.16 40)",
      ],
      [1.15, -8, 4, -2],
    ),
    caption: "Indicateur d'usure à 0,5 %",
    alt: "Photo de l'entretien « Chaîne et plaquettes avant remplacées »",
    takenOn: "2026-10-12",
    origin: {
      kind: "maintenance_event",
      id: 9,
      title: "Chaîne et plaquettes avant remplacées",
      on: "2026-10-12",
    },
  }),
  newChain: photo({
    id: 207,
    art: photoArt(
      "chain",
      [
        "oklch(0.8 0.02 230)",
        "oklch(0.68 0.03 230)",
        "oklch(0.82 0.03 80)",
        "oklch(0.32 0.03 250)",
        "oklch(0.62 0.12 230)",
      ],
      [0.95, 6, 0, 0],
    ),
    caption: null,
    alt: "Photo de l'entretien « Chaîne et plaquettes avant remplacées »",
    takenOn: "2026-10-12",
    origin: {
      kind: "maintenance_event",
      id: 9,
      title: "Chaîne et plaquettes avant remplacées",
      on: "2026-10-12",
    },
  }),
  torque: photo({
    id: 208,
    art: photoArt(
      "wrench",
      [
        "oklch(0.7 0.04 200)",
        "oklch(0.58 0.05 210)",
        "oklch(0.86 0.02 90)",
        "oklch(0.3 0.03 250)",
        "oklch(0.66 0.15 30)",
      ],
      [1, -10, 0, 0],
    ),
    caption: "Étriers resserrés à la clé dynamométrique",
    alt: "Photo de l'entretien « Chaîne et plaquettes avant remplacées »",
    takenOn: "2026-10-12",
    origin: {
      kind: "maintenance_event",
      id: 9,
      title: "Chaîne et plaquettes avant remplacées",
      on: "2026-10-12",
    },
  }),
  cutTire: photo({
    id: 209,
    art: photoArt(
      "tire",
      [
        "oklch(0.66 0.03 70)",
        "oklch(0.52 0.03 60)",
        "oklch(0.6 0.02 80)",
        "oklch(0.24 0.01 260)",
        "oklch(0.9 0.02 90)",
      ],
      [1.12, 8, 0, 4],
    ),
    caption: "Flanc coupé dans le pierrier",
    alt: "Photo du composant « Pneu arrière d'origine »",
    takenOn: "2026-09-12",
    origin: { kind: "component", id: 10, title: "Pneu arrière d'origine, retiré", on: null },
  }),
  bentDerailleur: photo({
    id: 210,
    art: photoArt(
      "derailleur",
      [
        "oklch(0.6 0.05 150)",
        "oklch(0.46 0.05 150)",
        "oklch(0.3 0.02 260)",
        "oklch(0.2 0.02 260)",
        "oklch(0.68 0.14 60)",
      ],
      [1.05, 14, 0, 0],
    ),
    caption: "Chape tordue après la chute",
    alt: "Photo du composant « Dérailleur arrière d'origine »",
    takenOn: "2026-09-12",
    origin: { kind: "component", id: 5, title: "Dérailleur arrière d'origine, retiré", on: null },
  }),
  lesGets: photo({
    id: 211,
    art: photoArt(
      "land",
      [
        "oklch(0.82 0.08 230)",
        "oklch(0.95 0.03 200)",
        "oklch(0.62 0.08 160)",
        "oklch(0.4 0.06 160)",
        "oklch(0.97 0 0)",
      ],
      [1.3, 0, -10, 6],
    ),
    caption: "Les Gets, avant la chute",
    alt: "Photo de la sortie « Les Gets »",
    takenOn: "2026-09-12",
    origin: { kind: "ride", id: 58, title: "Les Gets", on: "2026-09-12" },
  }),
  sag: photo({
    id: 212,
    art: photoArt(
      "shock",
      [
        "oklch(0.76 0.03 250)",
        "oklch(0.64 0.04 250)",
        "oklch(0.3 0.02 260)",
        "oklch(0.86 0.02 90)",
        "oklch(0.62 0.17 30)",
      ],
      [1, -6, 0, 0],
    ),
    caption: "Sag à 30 % : repère du joint torique",
    alt: "Photo du composant « Amortisseur RockShox Super Deluxe »",
    takenOn: "2026-10-18",
    origin: { kind: "component", id: 2, title: "Amortisseur RockShox Super Deluxe", on: null },
  }),
  bauges: photo({
    id: 213,
    art: photoArt(
      "land",
      [
        "oklch(0.62 0.03 240)",
        "oklch(0.74 0.03 90)",
        "oklch(0.42 0.05 70)",
        "oklch(0.3 0.04 60)",
        "oklch(0.92 0.01 80)",
      ],
      [1.2, -3, 8, 4],
    ),
    caption: null,
    alt: "Photo de la sortie « Massif des Bauges »",
    takenOn: "2026-10-24",
    origin: { kind: "ride", id: 64, title: "Massif des Bauges", on: "2026-10-24" },
  }),
  newDerailleur: photo({
    id: 214,
    art: photoArt(
      "derailleur",
      [
        "oklch(0.84 0.02 230)",
        "oklch(0.74 0.03 230)",
        "oklch(0.26 0.02 260)",
        "oklch(0.18 0.02 260)",
        "oklch(0.6 0.12 230)",
      ],
      [0.95, 0, 0, 0],
    ),
    caption: "Dérailleur neuf réglé",
    alt: "Photo de l'entretien « Dérailleur et pneu arrière remplacés »",
    takenOn: "2026-09-15",
    origin: {
      kind: "maintenance_event",
      id: 7,
      title: "Dérailleur et pneu arrière remplacés",
      on: "2026-09-15",
    },
  }),
};

export const SPECTRAL_PHOTOS: PhotoVM[] = Object.values(p);

// --- Timeline ----------------------------------------------------------------------------------------

const bauges: TimelineItemVM = {
  kind: "ride",
  id: 64,
  on: "2026-10-24",
  bikeName: "Spectral",
  rideType: "enduro",
  title: "Massif des Bauges",
  distanceM: 38 * KM,
  durationS: 3 * H + 40 * 60,
  totalTimeS: 4 * H + 25 * 60,
  elevationGainM: 1620,
  runsCount: null,
  wearS: null,
  conditions: "mud",
  photos: [p.bauges],
};

const SPECTRAL_HISTORY: TimelineItemVM[] = [
  bauges,
  {
    kind: "ride",
    id: 63,
    on: "2026-10-18",
    bikeName: "Spectral",
    rideType: "trail",
    title: "Salève",
    distanceM: 32 * KM,
    durationS: 2 * H + 30 * 60,
    totalTimeS: null,
    elevationGainM: 1050,
    runsCount: null,
    wearS: null,
    conditions: "dry",
    photos: [],
  },
  {
    kind: "maintenance",
    id: 9,
    on: "2026-10-12",
    bikeName: "Spectral",
    performedBy: "self",
    shopName: null,
    title: "Chaîne et plaquettes avant remplacées",
    totalCostCents: 6890,
    note: null,
    invoices: [{ id: 301, name: "facture.pdf" }],
    photos: [p.chainGauge, p.newChain, p.torque],
  },
  {
    kind: "maintenance",
    id: 8,
    on: "2026-09-26",
    bikeName: "Spectral",
    performedBy: "shop",
    shopName: "Cycles du Lac",
    title: "Purge des freins avant et arrière",
    totalCostCents: 4500,
    note: null,
    invoices: [],
    photos: [],
  },
  {
    kind: "maintenance",
    id: 7,
    on: "2026-09-15",
    bikeName: "Spectral",
    performedBy: "self",
    shopName: null,
    title: "Dérailleur et pneu arrière remplacés",
    totalCostCents: 43030,
    note: "Après la chute des Gets",
    invoices: [],
    photos: [p.newDerailleur],
  },
  {
    kind: "ride",
    id: 58,
    on: "2026-09-12",
    bikeName: "Spectral",
    rideType: "bike_park",
    title: "Les Gets",
    distanceM: 41 * KM,
    durationS: null,
    totalTimeS: 6 * H,
    elevationGainM: null,
    runsCount: 14,
    wearS: 2 * H + 10 * 60,
    conditions: "dust",
    photos: [p.lesGets],
  },
];

// --- Workshop (parts only in phase 1) -------------------------------------------------------------

const RAYON = { shopName: "Rayon Libre", shopKind: "online" as const };
const CYCLES = { shopName: "Cycles du Lac", shopKind: "physical" as const };

function item(
  fields: Partial<InventoryItemVM> &
    Pick<InventoryItemVM, "id" | "name" | "category" | "bikes" | "quantity" | "unit">,
): InventoryItemVM {
  return {
    kind: "part",
    location: null,
    state: null,
    brand: null,
    reference: null,
    componentTypeCode: null,
    lowStockThreshold: null,
    lastUnitCostCents: null,
    restock: { status: "none", quantity: null, changedOn: null, orderedOn: null, shopName: null },
    purchaseLinks: [],
    rulesServed: [],
    lastUse: null,
    movements: [],
    notes: null,
    ...fields,
  };
}

export const WORKSHOP_ITEMS: InventoryItemVM[] = [
  item({
    id: 101,
    lastUnitCostCents: 2200,
    name: "Plaquettes Maven organiques",
    brand: "SRAM",
    reference: "Maven organique",
    category: "brakes",
    componentTypeCode: "brake_pads",
    bikes: [SPECTRAL],
    location: "Établi, tiroir 2",
    quantity: 1,
    unit: "pair",
    lowStockThreshold: 1,
    state: "low_stock",
    purchaseLinks: [
      {
        id: 1,
        ...RAYON,
        url: "https://rayonlibre.example/sram-maven-organiques",
        priceCents: 2200,
        lastPurchasedOn: "2026-09-03",
        priceNotedOn: null,
      },
      {
        id: 2,
        ...CYCLES,
        url: null,
        priceCents: 2600,
        lastPurchasedOn: null,
        priceNotedOn: "2026-09-26",
      },
    ],
    lastUse: {
      on: "2026-10-12",
      bikeName: "Spectral",
      title: "Chaîne et plaquettes avant remplacées",
    },
    movements: [
      {
        id: 4,
        kind: "use",
        quantityDelta: -1,
        occurredOn: "2026-10-12",
        source: "Spectral",
        detail: null,
        maintenance: { bikeId: 1, title: "Chaîne et plaquettes avant remplacées" },
      },
      {
        id: 3,
        kind: "purchase",
        quantityDelta: 2,
        occurredOn: "2026-09-03",
        source: "Rayon Libre",
        detail: "2 × 22,00 €",
        maintenance: null,
      },
      {
        id: 2,
        kind: "use",
        quantityDelta: -1,
        occurredOn: "2026-07-14",
        source: "Spectral",
        detail: null,
        maintenance: { bikeId: 1, title: "Plaquettes arrière remplacées" },
      },
      {
        id: 1,
        kind: "initial",
        quantityDelta: 1,
        occurredOn: "2026-05-05",
        source: null,
        detail: "Saisi à la création de l'objet",
        maintenance: null,
      },
    ],
    notes:
      "Organiques sur le Spectral : plus de mordant à froid, mais elles s'usent vite dans la boue.",
  }),
  item({
    id: 102,
    lastUnitCostCents: 1990,
    name: "Plaquettes métal N04C",
    brand: "Shimano",
    reference: "N04C",
    category: "brakes",
    componentTypeCode: "brake_pads",
    bikes: [LOURD],
    location: "Établi, tiroir 2",
    quantity: 2,
    unit: "pair",
    lowStockThreshold: 1,
    purchaseLinks: [
      {
        id: 3,
        ...RAYON,
        url: "https://rayonlibre.example/shimano-n04c",
        priceCents: 1990,
        lastPurchasedOn: "2026-09-03",
        priceNotedOn: null,
      },
    ],
    lastUse: { on: "2026-10-20", bikeName: "Le Lourd", title: "Plaquettes arrière remplacées" },
    movements: [
      {
        id: 6,
        kind: "use",
        quantityDelta: -1,
        occurredOn: "2026-10-20",
        source: "Le Lourd",
        detail: null,
        maintenance: { bikeId: 2, title: "Plaquettes arrière remplacées" },
      },
      {
        id: 5,
        kind: "purchase",
        quantityDelta: 3,
        occurredOn: "2026-09-03",
        source: "Rayon Libre",
        detail: "3 × 19,90 €",
        maintenance: null,
      },
    ],
    notes: "Métal : elles tiennent mieux que les organiques avec le poids du moteur.",
  }),
  item({
    id: 103,
    lastUnitCostCents: 2990,
    name: "Chaîne CN-M8100",
    brand: "Shimano",
    reference: "CN-M8100",
    category: "drivetrain",
    componentTypeCode: "chain",
    bikes: [GRAVEL],
    location: "Armoire, bac transmission",
    quantity: 0,
    unit: "piece",
    lowStockThreshold: 0,
    state: "ordered",
    restock: {
      status: "ordered",
      quantity: 1,
      changedOn: "2026-10-18",
      orderedOn: "2026-10-21",
      shopName: "Rayon Libre",
    },
    purchaseLinks: [
      {
        id: 4,
        ...RAYON,
        url: "https://rayonlibre.example/shimano-cn-m8100",
        priceCents: 2990,
        lastPurchasedOn: "2026-05-02",
        priceNotedOn: null,
      },
    ],
    rulesServed: [
      {
        ruleId: 31,
        bike: GRAVEL,
        title: "Contrôle d'usure de la chaîne",
        status: "due_soon",
        used: gravelChainRule.used,
        interval: gravelChainRule.interval,
        dueOn: null,
      },
    ],
    lastUse: { on: "2026-05-06", bikeName: "Gravel alu", title: "Chaîne remplacée" },
    movements: [
      {
        id: 8,
        kind: "use",
        quantityDelta: -1,
        occurredOn: "2026-05-06",
        source: "Gravel alu",
        detail: null,
        maintenance: { bikeId: 3, title: "Chaîne remplacée" },
      },
      {
        id: 7,
        kind: "purchase",
        quantityDelta: 1,
        occurredOn: "2026-05-02",
        source: "Rayon Libre",
        detail: "1 × 29,90 €",
        maintenance: null,
      },
    ],
  }),
  item({
    id: 104,
    lastUnitCostCents: 4690,
    name: "Chaîne GX Eagle T-Type",
    brand: "SRAM",
    reference: "Flattop T-Type",
    category: "drivetrain",
    componentTypeCode: "chain",
    bikes: [SPECTRAL],
    location: "Armoire, bac transmission",
    quantity: 1,
    unit: "piece",
    lowStockThreshold: 0,
    purchaseLinks: [
      {
        id: 5,
        ...RAYON,
        url: "https://rayonlibre.example/sram-gx-t-type",
        priceCents: 4690,
        lastPurchasedOn: "2026-09-03",
        priceNotedOn: null,
      },
    ],
    rulesServed: [
      {
        ruleId: 13,
        bike: SPECTRAL,
        title: "Contrôle d'usure de la chaîne",
        status: "ok",
        used: spectralChainRule.used,
        interval: spectralChainRule.interval,
        dueOn: null,
      },
    ],
    lastUse: {
      on: "2026-10-12",
      bikeName: "Spectral",
      title: "Chaîne et plaquettes avant remplacées",
    },
    movements: [
      {
        id: 10,
        kind: "use",
        quantityDelta: -1,
        occurredOn: "2026-10-12",
        source: "Spectral",
        detail: null,
        maintenance: { bikeId: 1, title: "Chaîne et plaquettes avant remplacées" },
      },
      {
        id: 9,
        kind: "purchase",
        quantityDelta: 2,
        occurredOn: "2026-09-03",
        source: "Rayon Libre",
        detail: "2 × 46,90 €",
        maintenance: null,
      },
    ],
  }),
  item({
    id: 105,
    name: "Kit joints bas de fourreaux Lyrik",
    brand: "RockShox",
    reference: "Service 50 h, 35 mm",
    category: "suspension",
    componentTypeCode: "fork",
    bikes: [SPECTRAL],
    quantity: 0,
    unit: "set",
    state: "to_order",
    restock: {
      status: "to_order",
      quantity: 1,
      changedOn: "2026-10-18",
      orderedOn: null,
      shopName: null,
    },
    rulesServed: [
      {
        ruleId: 11,
        bike: SPECTRAL,
        title: "Entretien des bas de fourreaux",
        status: "overdue",
        used: lyrikRule.used,
        interval: lyrikRule.interval,
        dueOn: null,
      },
    ],
    notes: "Pour l'entretien des bas de fourreaux, déjà en retard de 6 h 20.",
  }),
  item({
    id: 106,
    lastUnitCostCents: 850,
    name: "Chambre à air 29 × 2,3–2,6",
    brand: "Schwalbe",
    reference: "Presta 40 mm",
    category: "wheels",
    bikes: [SPECTRAL, LOURD],
    location: "Sac de selle et étagère",
    quantity: 2,
    unit: "piece",
    lowStockThreshold: 1,
    purchaseLinks: [
      {
        id: 6,
        ...CYCLES,
        url: null,
        priceCents: 850,
        lastPurchasedOn: "2026-05-05",
        priceNotedOn: null,
      },
    ],
    movements: [
      {
        id: 12,
        kind: "use",
        quantityDelta: -1,
        occurredOn: "2026-08-30",
        source: "Hors entretien",
        detail: "Crevaison au Salève",
        maintenance: null,
      },
      {
        id: 11,
        kind: "purchase",
        quantityDelta: 3,
        occurredOn: "2026-05-05",
        source: "Cycles du Lac",
        detail: "3 × 8,50 €",
        maintenance: null,
      },
    ],
    notes: "Une dans le sac de selle du Spectral, une en réserve pour le Lourd.",
  }),
  item({
    id: 107,
    lastUnitCostCents: 2490,
    name: "Patte de dérailleur UDH",
    brand: "SRAM",
    reference: "UDH",
    category: "frame",
    bikes: [SPECTRAL, LOURD],
    location: "Boîte à petites pièces",
    quantity: 1,
    unit: "piece",
    lowStockThreshold: 0,
    purchaseLinks: [
      {
        id: 7,
        ...RAYON,
        url: "https://rayonlibre.example/sram-udh",
        priceCents: 2490,
        lastPurchasedOn: "2026-06-08",
        priceNotedOn: null,
      },
    ],
    movements: [
      {
        id: 13,
        kind: "purchase",
        quantityDelta: 1,
        occurredOn: "2026-06-08",
        source: "Rayon Libre",
        detail: "1 × 24,90 €",
        maintenance: null,
      },
    ],
    notes: "La même pour les deux vélos : en racheter une dès qu'elle sert.",
  }),
  item({
    id: 108,
    name: "Kit chambre à air Float X",
    brand: "Fox",
    reference: "Air sleeve service kit",
    category: "suspension",
    componentTypeCode: "rear_shock",
    bikes: [LOURD],
    quantity: 0,
    unit: "set",
    state: "to_order",
    restock: {
      status: "to_order",
      quantity: 1,
      changedOn: "2026-10-23",
      orderedOn: null,
      shopName: null,
    },
    purchaseLinks: [
      {
        id: 8,
        ...RAYON,
        url: "https://rayonlibre.example/fox-float-x-air-kit",
        priceCents: 3490,
        lastPurchasedOn: null,
        priceNotedOn: "2026-10-23",
      },
    ],
    rulesServed: [
      {
        ruleId: 21,
        bike: LOURD,
        title: "Entretien de la chambre à air",
        status: "due_soon",
        used: floatRule.used,
        interval: floatRule.interval,
        dueOn: null,
      },
    ],
  }),
  item({
    id: 109,
    name: "Kit câble et gaine de dérailleur",
    brand: "Jagwire",
    reference: "Sport Shift",
    category: "drivetrain",
    componentTypeCode: "shifter",
    bikes: [GRAVEL],
    location: "Armoire, bac transmission",
    quantity: 0,
    unit: "set",
    state: "to_order",
    restock: {
      status: "to_order",
      quantity: 1,
      changedOn: "2026-10-04",
      orderedOn: null,
      shopName: null,
    },
    purchaseLinks: [
      {
        id: 9,
        ...CYCLES,
        url: null,
        priceCents: 1890,
        lastPurchasedOn: null,
        priceNotedOn: "2026-10-04",
      },
    ],
    notes: "Le passage des vitesses accroche à l'arrière : à changer avant l'hiver.",
  }),
  item({
    id: 110,
    lastUnitCostCents: 2299,
    name: "Valves tubeless Presta 44 mm",
    brand: "Muc-Off",
    reference: "44 mm",
    category: "wheels",
    bikes: "all",
    location: "Boîte à petites pièces",
    quantity: 1,
    unit: "pair",
    lowStockThreshold: 1,
    state: "low_stock",
    purchaseLinks: [
      {
        id: 10,
        ...RAYON,
        url: "https://rayonlibre.example/valves-tubeless",
        priceCents: 2299,
        lastPurchasedOn: "2025-04-18",
        priceNotedOn: null,
      },
    ],
    movements: [
      {
        id: 15,
        kind: "adjustment",
        quantityDelta: -1,
        occurredOn: "2026-09-15",
        source: "Après comptage",
        detail: "Une paire perdue",
        maintenance: null,
      },
      {
        id: 14,
        kind: "purchase",
        quantityDelta: 2,
        occurredOn: "2025-04-18",
        source: "Rayon Libre",
        detail: "2 × 22,99 €",
        maintenance: null,
      },
    ],
  }),
];

const byId = (id: number) => WORKSHOP_ITEMS.find((it) => it.id === id)!;

export const WORKSHOP: WorkshopVM = { today: TODAY, bikes: BIKES, items: WORKSHOP_ITEMS };

// --- Dashboard ---------------------------------------------------------------------------------------

export const DASHBOARD: DashboardVM = {
  today: TODAY,
  firstName: "Camille",
  counts: { overdue: 1, dueSoon: 3, toRebuy: 6 },
  rules: [lyrikRule, gravelChainRule, sealantRule, floatRule],
  tasks: [pivotsTask, truingTask],
  bikes: [
    {
      bike: SPECTRAL,
      discipline: "enduro",
      isElectric: false,
      monthDistanceM: 182 * KM,
      monthDurationS: 14 * H,
      alert: { status: "overdue", count: 1 },
    },
    {
      bike: LOURD,
      discipline: "enduro",
      isElectric: true,
      monthDistanceM: 96 * KM,
      monthDurationS: 7 * H,
      alert: { status: "due_soon", count: 1 },
    },
    {
      bike: GRAVEL,
      discipline: "gravel",
      isElectric: false,
      monthDistanceM: 248 * KM,
      monthDurationS: 9 * H,
      alert: { status: "due_soon", count: 1 },
    },
  ],
  // Most urgent first (D-41): needed by a late rule, by a due-soon rule, to order, ordered, low stock.
  rebuy: [
    {
      itemId: 105,
      name: byId(105).name,
      bikes: [SPECTRAL],
      state: "to_order",
      reason: { kind: "rule", status: "overdue", neededOn: null },
    },
    {
      itemId: 108,
      name: byId(108).name,
      bikes: [LOURD],
      state: "to_order",
      reason: { kind: "rule", status: "due_soon", neededOn: null },
    },
    {
      itemId: 109,
      name: byId(109).name,
      bikes: [GRAVEL],
      state: "to_order",
      reason: { kind: "price", priceCents: 1890 },
    },
    {
      itemId: 103,
      name: byId(103).name,
      bikes: [GRAVEL],
      state: "ordered",
      reason: { kind: "ordered", orderedOn: "2026-10-21", priceCents: 2990 },
    },
    {
      itemId: 101,
      name: byId(101).name,
      bikes: [SPECTRAL],
      state: "low_stock",
      reason: { kind: "low_stock", quantity: 1, unit: "pair" },
    },
    {
      itemId: 110,
      name: byId(110).name,
      bikes: "all",
      state: "low_stock",
      reason: { kind: "low_stock", quantity: 1, unit: "pair" },
    },
  ],
  activity: [
    { ...bauges, photos: [] },
    {
      kind: "ride",
      id: 41,
      on: "2026-10-22",
      bikeName: "Gravel alu",
      rideType: "gravel",
      title: "Boucle du plateau",
      distanceM: 62 * KM,
      durationS: 2 * H + 45 * 60,
      totalTimeS: null,
      elevationGainM: 640,
      runsCount: null,
      wearS: null,
      conditions: null,
      photos: [],
    },
    {
      kind: "maintenance",
      id: 12,
      on: "2026-10-20",
      bikeName: "Le Lourd",
      performedBy: "self",
      shopName: null,
      title: "Plaquettes arrière remplacées",
      totalCostCents: 3800,
      note: null,
      invoices: [],
      photos: [],
    },
  ],
};

// --- Bike page: the Spectral -----------------------------------------------------------------------

const costEvents = [
  {
    id: 1,
    on: "2025-03-14",
    title: "Révision des 1 an",
    shopName: "Cycles du Lac",
    costCents: 18900,
  },
  { id: 2, on: "2025-04-18", title: "Pneu avant remplacé", shopName: null, costCents: 7290 },
  {
    id: 3,
    on: "2025-05-02",
    title: "Plaquettes avant remplacées",
    shopName: null,
    costCents: 2200,
  },
  { id: 4, on: "2025-06-06", title: "Chaîne remplacée", shopName: null, costCents: 4490 },
  {
    id: 5,
    on: "2026-03-02",
    title: "Entretien fourche et amortisseur",
    shopName: "Cycles du Lac",
    costCents: 38900,
  },
  {
    id: 6,
    on: "2026-07-14",
    title: "Plaquettes arrière remplacées",
    shopName: null,
    costCents: 2200,
  },
  {
    id: 7,
    on: "2026-09-15",
    title: "Dérailleur et pneu arrière remplacés",
    shopName: null,
    costCents: 43030,
  },
  {
    id: 8,
    on: "2026-09-26",
    title: "Purge des freins avant et arrière",
    shopName: "Cycles du Lac",
    costCents: 4500,
  },
  {
    id: 9,
    on: "2026-10-12",
    title: "Chaîne et plaquettes avant remplacées",
    shopName: null,
    costCents: 6890,
  },
];
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const shopCents = sum(costEvents.filter((e) => e.shopName).map((e) => e.costCents));
const homeCents = sum(costEvents.filter((e) => !e.shopName).map((e) => e.costCents));
const purchaseCents = 429_900;
const riddenM = 2846 * KM;
const totalCents = purchaseCents + shopCents + homeCents;

export const SPECTRAL_PAGE: BikePageVM = {
  today: TODAY,
  bike: {
    ...SPECTRAL,
    brand: "Canyon",
    model: "Spectral 29 CF",
    modelYear: 2024,
    frameSize: "L",
    discipline: "enduro",
    isElectric: false,
    status: "active",
  },
  stats: {
    distanceM: riddenM,
    wearS: 198 * H,
    rideCount: 64,
    daysSinceLastMaintenance: 13,
    trackedSince: "2024-03-14",
  },
  rules: [lyrikRule, sealantRule, spectralChainRule, bleedRule],
  tasks: [pivotsTask],
  components: {
    purchasedOn: "2024-03-14",
    groups: [
      {
        group: "suspension",
        components: [
          {
            id: 1,
            typeLabel: "Fourche",
            model: "RockShox Lyrik Ultimate · 160 mm",
            status: "overdue",
            counter: { unit: "duration_s", value: 198 * H },
            installedOn: null,
            photos: [],
            lineage: [],
          },
          {
            id: 2,
            typeLabel: "Amortisseur",
            model: "RockShox Super Deluxe Ultimate",
            status: null,
            counter: { unit: "duration_s", value: 198 * H },
            installedOn: null,
            photos: [p.sag],
            lineage: [],
          },
        ],
      },
      {
        group: "drivetrain",
        components: [
          {
            id: 3,
            typeLabel: "Chaîne",
            model: "SRAM GX Eagle T-Type",
            status: "ok",
            counter: { unit: "distance_m", value: 86 * KM },
            installedOn: "2026-10-12",
            photos: [],
            lineage: [
              {
                model: "SRAM GX Eagle T-Type",
                removedOn: "2025-06-06",
                wearAtRemoval: { unit: "distance_m", value: 1350 * KM },
                reason: "worn",
                note: "allongement 0,6 %",
                photos: [],
              },
              {
                model: "SRAM GX Eagle T-Type",
                removedOn: "2026-10-12",
                wearAtRemoval: { unit: "distance_m", value: 1410 * KM },
                reason: "worn",
                note: "allongement 0,5 %",
                photos: [],
              },
            ],
          },
          {
            id: 4,
            typeLabel: "Cassette",
            model: "SRAM XS-1275 · 10-52",
            status: null,
            counter: { unit: "distance_m", value: 2846 * KM },
            installedOn: null,
            photos: [],
            lineage: [],
          },
          {
            id: 5,
            typeLabel: "Dérailleur arrière",
            model: "SRAM GX Eagle Transmission",
            status: null,
            counter: { unit: "distance_m", value: 436 * KM },
            installedOn: "2026-09-15",
            photos: [],
            lineage: [
              {
                model: "SRAM GX Eagle Transmission",
                removedOn: "2026-09-15",
                wearAtRemoval: { unit: "distance_m", value: 2410 * KM },
                reason: "crash",
                note: "chape tordue aux Gets",
                photos: [p.bentDerailleur],
              },
            ],
          },
        ],
      },
      {
        group: "brakes",
        components: [
          {
            id: 6,
            typeLabel: "Freins",
            model: "SRAM Maven Silver",
            status: "ok",
            counter: { unit: "distance_m", value: 2846 * KM },
            installedOn: null,
            photos: [],
            lineage: [],
          },
          {
            id: 7,
            typeLabel: "Plaquettes avant",
            model: "SRAM organiques",
            status: null,
            counter: { unit: "distance_m", value: 86 * KM },
            installedOn: "2026-10-12",
            photos: [],
            lineage: [
              {
                model: "SRAM organiques",
                removedOn: "2025-05-02",
                wearAtRemoval: { unit: "distance_m", value: 1180 * KM },
                reason: "worn",
                note: "garniture à 1 mm",
                photos: [],
              },
              {
                model: "SRAM organiques",
                removedOn: "2026-10-12",
                wearAtRemoval: { unit: "distance_m", value: 1580 * KM },
                reason: "worn",
                note: "garniture à 0,9 mm",
                photos: [],
              },
            ],
          },
          {
            id: 8,
            typeLabel: "Plaquettes arrière",
            model: "SRAM organiques",
            status: null,
            counter: { unit: "distance_m", value: 604 * KM },
            installedOn: "2026-07-14",
            photos: [],
            lineage: [
              {
                model: "SRAM organiques",
                removedOn: "2026-07-14",
                wearAtRemoval: { unit: "distance_m", value: 2242 * KM },
                reason: "worn",
                note: "garniture à 1 mm",
                photos: [],
              },
            ],
          },
        ],
      },
      {
        group: "wheels",
        components: [
          {
            id: 9,
            typeLabel: "Pneu avant",
            model: "Maxxis Assegai 2.5 · EXO+",
            status: "due_soon",
            counter: { unit: "distance_m", value: 1906 * KM },
            installedOn: "2025-04-18",
            photos: [],
            lineage: [
              {
                model: "Maxxis Minion DHF 2.5 · EXO",
                removedOn: "2025-04-18",
                wearAtRemoval: { unit: "distance_m", value: 940 * KM },
                reason: "upgrade",
                note: "plus d'accroche dans le mouillé",
                photos: [],
              },
            ],
          },
          {
            id: 10,
            typeLabel: "Pneu arrière",
            model: "Maxxis DHR II 2.4 · DoubleDown",
            status: "due_soon",
            counter: { unit: "distance_m", value: 436 * KM },
            installedOn: "2026-09-15",
            photos: [],
            lineage: [
              {
                model: "Maxxis Minion DHR II 2.4 · EXO",
                removedOn: "2026-09-15",
                wearAtRemoval: { unit: "distance_m", value: 2410 * KM },
                reason: "broken",
                note: "flanc coupé aux Gets",
                photos: [p.cutTire],
              },
            ],
          },
        ],
      },
    ],
  },
  stock: {
    // In stock for the Spectral, alerts first; "total" counts every item serving it.
    rows: [101, 110, 104, 106, 107].map((id) => {
      const it = byId(id);
      return {
        id: it.id,
        name: it.name,
        category: it.category,
        bikes: it.bikes,
        location: it.location,
        quantity: it.quantity,
        unit: it.unit,
        state: it.state,
      };
    }),
    total: 6,
    toRebuy: 3,
  },
  history: SPECTRAL_HISTORY,
  record: {
    identity: {
      brand: "Canyon",
      model: "Spectral 29 CF",
      modelYear: 2024,
      discipline: "enduro",
      frameSize: "L",
      wheelSize: "29",
      color: "Bleu nuit mat",
      weightG: 15_200,
      isElectric: false,
    },
    purchase: {
      purchasedOn: "2024-03-14",
      priceCents: purchaseCents,
      shop: { name: "Rayon Libre", kind: "online" },
      boughtUsed: false,
      initialDistanceM: 0,
      initialWearS: 0,
    },
    frameSerial: "CN24 7Q3M 8K41",
    documents: [
      {
        id: 401,
        name: "Facture d'achat.pdf",
        sizeBytes: 412_000,
        addedOn: "2024-03-14",
        url: "#facture-achat",
      },
      {
        id: 402,
        name: "Certificat de garantie du cadre.pdf",
        sizeBytes: 1_100_000,
        addedOn: "2024-03-14",
        url: "#garantie-cadre",
      },
    ],
    status: "active",
    statusChangedOn: "2024-03-14",
    cost: {
      purchaseCents,
      shopCents,
      shopVisits: costEvents.filter((e) => e.shopName).length,
      homeCents,
      homeEvents: costEvents.filter((e) => !e.shopName).length,
      saleCents: null,
      totalCents,
      riddenDistanceM: riddenM,
      rideCount: 64,
      per100KmCents: Math.round((totalCents * 100_000) / riddenM),
      per100KmUpkeepCents: Math.round(((shopCents + homeCents) * 100_000) / riddenM),
      events: costEvents,
    },
  },
  photos: SPECTRAL_PHOTOS,
};

// --- Sheets ----------------------------------------------------------------------------------------

export const QUICK_RIDE: QuickRideVM = {
  today: TODAY,
  bikes: [
    { ...SPECTRAL, usualRideType: "trail" },
    { ...LOURD, usualRideType: "enduro" },
    { ...GRAVEL, usualRideType: "gravel" },
  ],
  defaultBikeId: SPECTRAL.id,
  recentLocations: ["Massif des Bauges", "Salève", "Les Gets"],
};

export const REPLACE_ON_SPECTRAL: ReplacePartVM = {
  bike: SPECTRAL,
  slots: [
    {
      componentId: 7,
      label: "Plaquettes avant",
      componentTypeCode: "brake_pads",
      fitted: { model: "SRAM organiques", counter: { unit: "distance_m", value: 86 * KM } },
    },
    {
      componentId: 8,
      label: "Plaquettes arrière",
      componentTypeCode: "brake_pads",
      fitted: { model: "SRAM organiques", counter: { unit: "distance_m", value: 604 * KM } },
    },
    {
      componentId: 3,
      label: "Chaîne",
      componentTypeCode: "chain",
      fitted: { model: "SRAM GX Eagle T-Type", counter: { unit: "distance_m", value: 86 * KM } },
    },
    {
      componentId: 9,
      label: "Pneu avant",
      componentTypeCode: "tire",
      fitted: {
        model: "Maxxis Assegai 2.5 · EXO+",
        counter: { unit: "distance_m", value: 1906 * KM },
      },
    },
  ],
  stock: WORKSHOP_ITEMS,
};

/** Component types a part can fit (seeded reference data from feature 2, labels in French). */
export const COMPONENT_TYPES: ComponentTypeOption[] = [
  { code: "fork", label: "Fourche" },
  { code: "rear_shock", label: "Amortisseur" },
  { code: "dropper_post", label: "Tige de selle télescopique" },
  { code: "chain", label: "Chaîne" },
  { code: "cassette", label: "Cassette" },
  { code: "chainring", label: "Plateau" },
  { code: "rear_derailleur", label: "Dérailleur arrière" },
  { code: "shifter", label: "Commande de vitesses" },
  { code: "brake", label: "Frein" },
  { code: "brake_pads", label: "Plaquettes" },
  { code: "rotor", label: "Disque" },
  { code: "tire", label: "Pneu" },
  { code: "wheel", label: "Roue" },
  { code: "grips", label: "Poignées" },
  { code: "other", label: "Autre" },
];
