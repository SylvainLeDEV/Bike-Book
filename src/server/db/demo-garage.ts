import "server-only";
import { replacedTitle } from "@/lib/display";
import type {
  ComponentPosition,
  ComponentTypeCode,
  InventoryCategory,
  InventoryUnit,
  RemovalReason,
  ShopKind,
} from "@/lib/enums";
import { endOfLocalDay, startOfLocalDay, type LocalDate } from "@/lib/format";
import { eventInstant } from "@/server/domain/time";
import { rideWear } from "@/server/domain/wear";
import type { AccessContext } from "./access-context";
import { createComponent, replaceComponent } from "./components";
import { addMovement, createItem, setRestock } from "./inventory";
import { createMaintenanceEvent } from "./maintenance";
import { listRuleTemplates } from "./reference";
import { listRideUsages } from "./rides";
import { createRule } from "./rules";
import { createTask } from "./tasks";

// The demo garage's parts and their history, as on /design (fictitious, D-22). Dates are those of
// the fixtures (today = Sunday 25 October 2026); the seed moves them by whole weeks (D-58).

type DemoPart = {
  key: string;
  bike: string;
  type: ComponentTypeCode;
  position?: ComponentPosition;
  brand: string;
  model: string;
  specs?: Record<string, string | number>;
  initialDistanceM?: number;
};

type DemoReplacement = {
  on: LocalDate;
  part: string;
  reason: Exclude<RemovalReason, "sold_with_bike">;
  note: string | null;
  newPart: { brand: string; model: string; priceCents: number };
  /** Several parts replaced the same day share one event: the first one names it. */
  eventTitle?: string;
  sameEventAsPrevious?: boolean;
  /** Taken from the workshop's stock (feature 8). */
  item?: string;
};

type DemoItem = {
  key: string;
  name: string;
  brand: string;
  reference: string | null;
  category: InventoryCategory;
  type: ComponentTypeCode | null;
  bikes: string[] | "all";
  unit: InventoryUnit;
  threshold: number | null;
  location: string | null;
  link: { shop: string; kind: ShopKind; url: string | null; priceCents: number } | null;
  /** Stock before tracking it here. */
  initial?: { on: LocalDate; quantity: number };
  purchases?: { on: LocalDate; quantity: number }[];
  /** Uses outside a replacement. */
  uses?: LocalDate[];
  restock?: { status: "to_order" | "ordered"; quantity: number; on: LocalDate };
};

/** The workshop of /design, parts only in phase 1 (D-33). */
const ITEMS: DemoItem[] = [
  {
    key: "i.maven",
    name: "Plaquettes Maven organiques",
    brand: "SRAM",
    reference: "Maven organique",
    category: "brakes",
    type: "brake_pads",
    bikes: ["Spectral"],
    unit: "pair",
    threshold: 1,
    location: "Établi, tiroir 2",
    link: {
      shop: "Rayon Libre",
      kind: "online",
      url: "https://rayonlibre.example/sram-maven-organiques",
      priceCents: 2200,
    },
    initial: { on: "2026-05-05", quantity: 1 },
    purchases: [{ on: "2026-09-03", quantity: 2 }],
  },
  {
    key: "i.n04c",
    name: "Plaquettes métal N04C",
    brand: "Shimano",
    reference: "N04C",
    category: "brakes",
    type: "brake_pads",
    bikes: ["Le Lourd"],
    unit: "pair",
    threshold: 1,
    location: "Établi, tiroir 2",
    link: {
      shop: "Rayon Libre",
      kind: "online",
      url: "https://rayonlibre.example/shimano-n04c",
      priceCents: 1990,
    },
    purchases: [{ on: "2026-09-03", quantity: 3 }],
  },
  {
    key: "i.cnm8100",
    name: "Chaîne CN-M8100",
    brand: "Shimano",
    reference: "CN-M8100",
    category: "drivetrain",
    type: "chain",
    bikes: ["Gravel alu"],
    unit: "piece",
    threshold: 0,
    location: "Armoire, bac transmission",
    link: {
      shop: "Rayon Libre",
      kind: "online",
      url: "https://rayonlibre.example/shimano-cn-m8100",
      priceCents: 2990,
    },
    purchases: [{ on: "2026-05-02", quantity: 1 }],
    restock: { status: "ordered", quantity: 1, on: "2026-10-21" },
  },
  {
    key: "i.gxchain",
    name: "Chaîne GX Eagle T-Type",
    brand: "SRAM",
    reference: "Flattop T-Type",
    category: "drivetrain",
    type: "chain",
    bikes: ["Spectral"],
    unit: "piece",
    threshold: 0,
    location: "Armoire, bac transmission",
    link: {
      shop: "Rayon Libre",
      kind: "online",
      url: "https://rayonlibre.example/sram-gx-t-type",
      priceCents: 4690,
    },
    purchases: [{ on: "2026-09-03", quantity: 2 }],
  },
  {
    key: "i.lyrik",
    name: "Kit joints bas de fourreaux Lyrik",
    brand: "RockShox",
    reference: "Service 50 h, 35 mm",
    category: "suspension",
    type: "fork",
    bikes: ["Spectral"],
    unit: "set",
    threshold: null,
    location: null,
    link: null,
    restock: { status: "to_order", quantity: 1, on: "2026-10-18" },
  },
  {
    key: "i.tube",
    name: "Chambre à air 29 × 2,3–2,6",
    brand: "Schwalbe",
    reference: "Presta 40 mm",
    category: "wheels",
    type: null,
    bikes: ["Spectral", "Le Lourd"],
    unit: "piece",
    threshold: 1,
    location: "Sac de selle et étagère",
    link: { shop: "Cycles du Lac", kind: "physical", url: null, priceCents: 850 },
    purchases: [{ on: "2026-05-05", quantity: 3 }],
    uses: ["2026-08-30"],
  },
  {
    key: "i.udh",
    name: "Patte de dérailleur UDH",
    brand: "SRAM",
    reference: "UDH",
    category: "frame",
    type: null,
    bikes: ["Spectral", "Le Lourd"],
    unit: "piece",
    threshold: 0,
    location: "Boîte à petites pièces",
    link: {
      shop: "Rayon Libre",
      kind: "online",
      url: "https://rayonlibre.example/sram-udh",
      priceCents: 2490,
    },
    purchases: [{ on: "2026-06-08", quantity: 1 }],
  },
  {
    key: "i.float",
    name: "Kit chambre à air Float X",
    brand: "Fox",
    reference: "Air sleeve service kit",
    category: "suspension",
    type: "rear_shock",
    bikes: ["Le Lourd"],
    unit: "set",
    threshold: null,
    location: null,
    link: {
      shop: "Rayon Libre",
      kind: "online",
      url: "https://rayonlibre.example/fox-float-x-air-kit",
      priceCents: 3490,
    },
    restock: { status: "to_order", quantity: 1, on: "2026-10-23" },
  },
  {
    key: "i.cable",
    name: "Kit câble et gaine de dérailleur",
    brand: "Jagwire",
    reference: "Sport Shift",
    category: "drivetrain",
    type: "shifter",
    bikes: ["Gravel alu"],
    unit: "set",
    threshold: null,
    location: "Armoire, bac transmission",
    link: { shop: "Cycles du Lac", kind: "physical", url: null, priceCents: 1890 },
    restock: { status: "to_order", quantity: 1, on: "2026-10-24" },
  },
  {
    key: "i.valves",
    name: "Valves tubeless Presta 44 mm",
    brand: "Muc-Off",
    reference: "44 mm",
    category: "wheels",
    type: null,
    bikes: "all",
    unit: "pair",
    threshold: 1,
    location: "Boîte à petites pièces",
    link: {
      shop: "Rayon Libre",
      kind: "online",
      url: "https://rayonlibre.example/valves-tubeless",
      priceCents: 2299,
    },
    purchases: [{ on: "2026-04-11", quantity: 1 }],
  },
];

const PARTS: DemoPart[] = [
  // Spectral (Canyon Spectral 29 CF, bought 2024-03-14).
  {
    key: "s.fork",
    bike: "Spectral",
    type: "fork",
    brand: "RockShox",
    model: "Lyrik Ultimate",
    specs: { travel_mm: 160 },
  },
  {
    key: "s.shock",
    bike: "Spectral",
    type: "rear_shock",
    brand: "RockShox",
    model: "Super Deluxe Ultimate",
  },
  { key: "s.chain", bike: "Spectral", type: "chain", brand: "SRAM", model: "GX Eagle T-Type" },
  { key: "s.cassette", bike: "Spectral", type: "cassette", brand: "SRAM", model: "XS-1275 10-52" },
  {
    key: "s.derailleur",
    bike: "Spectral",
    type: "rear_derailleur",
    brand: "SRAM",
    model: "GX Eagle Transmission",
  },
  {
    key: "s.brake.f",
    bike: "Spectral",
    type: "brake",
    position: "front",
    brand: "SRAM",
    model: "Maven Silver",
  },
  {
    key: "s.brake.r",
    bike: "Spectral",
    type: "brake",
    position: "rear",
    brand: "SRAM",
    model: "Maven Silver",
  },
  {
    key: "s.pads.f",
    bike: "Spectral",
    type: "brake_pads",
    position: "front",
    brand: "SRAM",
    model: "Organiques",
  },
  {
    key: "s.pads.r",
    bike: "Spectral",
    type: "brake_pads",
    position: "rear",
    brand: "SRAM",
    model: "Organiques",
  },
  {
    key: "s.tire.f",
    bike: "Spectral",
    type: "tire",
    position: "front",
    brand: "Maxxis",
    model: "Minion DHF 2.5 EXO",
  },
  {
    key: "s.tire.r",
    bike: "Spectral",
    type: "tire",
    position: "rear",
    brand: "Maxxis",
    model: "Minion DHR II 2.4 EXO",
  },
  // Le Lourd (Orbea Wild H20, bought 2025-04-12).
  {
    key: "l.fork",
    bike: "Le Lourd",
    type: "fork",
    brand: "Fox",
    model: "38 Performance",
    specs: { travel_mm: 170 },
  },
  {
    key: "l.shock",
    bike: "Le Lourd",
    type: "rear_shock",
    brand: "Fox",
    model: "Float X Performance",
  },
  { key: "l.chain", bike: "Le Lourd", type: "chain", brand: "Shimano", model: "CN-M8100" },
  {
    key: "l.brake.f",
    bike: "Le Lourd",
    type: "brake",
    position: "front",
    brand: "Shimano",
    model: "XT M8120",
  },
  {
    key: "l.brake.r",
    bike: "Le Lourd",
    type: "brake",
    position: "rear",
    brand: "Shimano",
    model: "XT M8120",
  },
  {
    key: "l.pads.f",
    bike: "Le Lourd",
    type: "brake_pads",
    position: "front",
    brand: "Shimano",
    model: "N04C",
  },
  {
    key: "l.pads.r",
    bike: "Le Lourd",
    type: "brake_pads",
    position: "rear",
    brand: "Shimano",
    model: "N04C",
  },
  {
    key: "l.tire.f",
    bike: "Le Lourd",
    type: "tire",
    position: "front",
    brand: "Maxxis",
    model: "Assegai 2.5 EXO+",
  },
  {
    key: "l.tire.r",
    bike: "Le Lourd",
    type: "tire",
    position: "rear",
    brand: "Maxxis",
    model: "Minion DHR II 2.4 DoubleDown",
  },
  { key: "l.motor", bike: "Le Lourd", type: "motor", brand: "Bosch", model: "Performance Line CX" },
  { key: "l.battery", bike: "Le Lourd", type: "battery", brand: "Bosch", model: "PowerTube 750" },
  // Gravel alu (Specialized Diverge E5, bought used on 2023-05-20 with 1 850 km).
  {
    key: "g.chain",
    bike: "Gravel alu",
    type: "chain",
    brand: "Shimano",
    model: "CN-M8100",
    initialDistanceM: 1_850_000,
  },
  {
    key: "g.brake.f",
    bike: "Gravel alu",
    type: "brake",
    position: "front",
    brand: "Shimano",
    model: "GRX RX400",
  },
  {
    key: "g.brake.r",
    bike: "Gravel alu",
    type: "brake",
    position: "rear",
    brand: "Shimano",
    model: "GRX RX400",
  },
  {
    key: "g.tire.f",
    bike: "Gravel alu",
    type: "tire",
    position: "front",
    brand: "Specialized",
    model: "Pathfinder Pro 42",
  },
  {
    key: "g.tire.r",
    bike: "Gravel alu",
    type: "tire",
    position: "rear",
    brand: "Specialized",
    model: "Pathfinder Pro 42",
  },
];

const REPLACEMENTS: DemoReplacement[] = [
  {
    on: "2025-04-18",
    part: "s.tire.f",
    reason: "upgrade",
    note: "plus d'accroche dans le mouillé",
    newPart: { brand: "Maxxis", model: "Assegai 2.5 EXO+", priceCents: 7290 },
  },
  {
    on: "2025-05-02",
    part: "s.pads.f",
    reason: "worn",
    note: "garniture à 1 mm",
    newPart: { brand: "SRAM", model: "Organiques", priceCents: 2200 },
  },
  {
    on: "2025-06-06",
    part: "s.chain",
    reason: "worn",
    note: "allongement 0,6 %",
    newPart: { brand: "SRAM", model: "GX Eagle T-Type", priceCents: 4490 },
  },
  {
    on: "2026-05-06",
    part: "g.chain",
    item: "i.cnm8100",
    reason: "worn",
    note: "allongement 0,75 %",
    newPart: { brand: "Shimano", model: "CN-M8100", priceCents: 3290 },
  },
  {
    on: "2026-07-14",
    part: "s.pads.r",
    item: "i.maven",
    reason: "worn",
    note: "garniture à 1 mm",
    newPart: { brand: "SRAM", model: "Organiques", priceCents: 2200 },
  },
  {
    on: "2026-09-15",
    part: "s.derailleur",
    reason: "crash",
    note: "chape tordue aux Gets",
    newPart: { brand: "SRAM", model: "GX Eagle Transmission", priceCents: 34_900 },
    eventTitle: "Dérailleur et pneu arrière remplacés",
  },
  {
    on: "2026-09-15",
    part: "s.tire.r",
    reason: "broken",
    note: "flanc coupé aux Gets",
    newPart: { brand: "Maxxis", model: "Minion DHR II 2.4 DoubleDown", priceCents: 8130 },
    sameEventAsPrevious: true,
  },
  {
    on: "2026-10-12",
    part: "s.chain",
    item: "i.gxchain",
    reason: "worn",
    note: "allongement 0,5 %",
    newPart: { brand: "SRAM", model: "GX Eagle T-Type", priceCents: 4690 },
    eventTitle: "Chaîne et plaquettes avant remplacées",
  },
  {
    on: "2026-10-12",
    part: "s.pads.f",
    item: "i.maven",
    reason: "worn",
    note: "garniture à 0,9 mm",
    newPart: { brand: "SRAM", model: "Organiques", priceCents: 2200 },
    sameEventAsPrevious: true,
  },
  {
    on: "2026-10-20",
    part: "l.pads.r",
    item: "i.n04c",
    reason: "worn",
    note: "garniture à 0,8 mm",
    newPart: { brand: "Shimano", model: "N04C", priceCents: 3800 },
  },
];

/** Shop visits of the Spectral (/design), with an invoice total. */
const SHOP_VISITS: {
  bike: string;
  on: LocalDate;
  title: string;
  totalCents: number;
  lines: {
    action: "serviced" | "bled" | "inspected" | "adjusted";
    part: string | null;
    description: string;
    /** The demo rule this line fulfils (its counter restarts). */
    rule?: string;
  }[];
}[] = [
  {
    bike: "Spectral",
    on: "2025-03-14",
    title: "Révision des 1 an",
    totalCents: 18_900,
    lines: [
      { action: "inspected", part: null, description: "Serrages, roulements, jeu de direction" },
      { action: "adjusted", part: "s.derailleur", description: "Réglage de la transmission" },
    ],
  },
  {
    bike: "Spectral",
    on: "2026-03-02",
    title: "Entretien fourche et amortisseur",
    totalCents: 38_900,
    lines: [
      {
        action: "serviced",
        part: "s.fork",
        description: "Bas de fourreaux, joints et huile",
        rule: "s.lowers",
      },
      { action: "serviced", part: "s.shock", description: "Chambre à air" },
    ],
  },
  {
    bike: "Spectral",
    on: "2026-09-26",
    title: "Purge des freins avant et arrière",
    totalCents: 4500,
    lines: [
      { action: "bled", part: "s.brake.f", description: "Huile minérale", rule: "s.bleed" },
      { action: "bled", part: "s.brake.r", description: "Huile minérale", rule: "s.bleed" },
    ],
  },
];

/**
 * Fits the demo parts on the demo bikes (original parts from each bike's purchase day), then
 * replays the replacements in date order, through the same data-access functions as the app.
 */
export function seedDemoParts(input: {
  ctx: AccessContext;
  bikes: Map<string, { id: number; purchasedOn: LocalDate }>;
  /** Moves a fixtures date to the seeded week (D-58). */
  day: (date: LocalDate) => LocalDate;
  now: number;
  timeZone: string;
}): void {
  const { ctx, bikes, day, now, timeZone } = input;
  const current = new Map<
    string,
    { id: number; type: ComponentTypeCode; position: ComponentPosition }
  >();

  for (const part of PARTS) {
    const bike = bikes.get(part.bike);
    if (!bike) throw new Error(`Demo part ${part.key}: no bike ${part.bike}`);
    const position = part.position ?? "none";
    const outcome = createComponent(
      ctx,
      bike.id,
      { typeCode: part.type, position },
      {
        brand: part.brand,
        model: part.model,
        reference: null,
        specs: part.specs ?? null,
        origin: "stock",
        installedAt: startOfLocalDay(bike.purchasedOn, timeZone),
        initialDistanceM: part.initialDistanceM ?? 0,
        initialWearS: 0,
        purchasedOn: null,
        purchasePriceCents: null,
        shop: null,
        warrantyEndsOn: null,
        notes: null,
      },
    );
    if (!outcome.ok) throw new Error(`Demo part ${part.key}: ${outcome.reason}`);
    current.set(part.key, { id: outcome.componentId, type: part.type, position });
  }

  // The workshop, before the replacements that take parts from it.
  const items = new Map<string, number>();
  for (const item of ITEMS) {
    const created = createItem(ctx, {
      name: item.name,
      brand: item.brand,
      reference: item.reference,
      category: item.category,
      componentTypeCode: item.type,
      allBikes: item.bikes === "all",
      bikeIds: item.bikes === "all" ? [] : item.bikes.map((name) => bikes.get(name)?.id ?? -1),
      unit: item.unit,
      lowStockThreshold: item.threshold,
      location: item.location,
      notes: null,
      initialQuantity: item.initial?.quantity ?? 0,
      link: item.link
        ? {
            shop: { name: item.link.shop, kind: item.link.kind },
            url: item.link.url,
            priceCents: item.link.priceCents,
          }
        : null,
      at: endOfLocalDay(day(item.initial?.on ?? "2026-04-01"), timeZone),
      today: day("2026-10-25"),
    });
    if (!created.ok) throw new Error(`Demo item ${item.key}: ${created.reason}`);
    items.set(item.key, created.itemId);
    for (const purchase of item.purchases ?? []) {
      addMovement(ctx, created.itemId, {
        kind: "purchase",
        quantityDelta: purchase.quantity,
        unitCostCents: item.link?.priceCents ?? null,
        note: null,
        at: endOfLocalDay(day(purchase.on), timeZone),
      });
    }
    for (const use of item.uses ?? []) {
      addMovement(ctx, created.itemId, {
        kind: "use",
        quantityDelta: -1,
        unitCostCents: null,
        note: null,
        at: endOfLocalDay(day(use), timeZone),
      });
    }
    if (item.restock) {
      setRestock(ctx, created.itemId, {
        status: item.restock.status,
        quantity: item.restock.quantity,
        changedOn: day(item.restock.on),
      });
    }
  }

  let lastEventId: number | null = null;
  for (const replacement of REPLACEMENTS) {
    const part = current.get(replacement.part);
    if (!part) throw new Error(`Demo replacement: no part ${replacement.part}`);
    const on = day(replacement.on);
    const outcome = replaceComponent(ctx, {
      removedComponentId: part.id,
      on,
      recordedAt: now,
      at: eventInstant(on, now, timeZone),
      reason: replacement.reason,
      removalNote: replacement.note,
      newPart: replacement.newPart,
      eventTitle: replacement.eventTitle ?? replacedTitle(part.type, part.position),
      eventId: replacement.sameEventAsPrevious ? lastEventId : null,
      fromItemId: replacement.item ? (items.get(replacement.item) ?? null) : null,
    });
    if (!outcome.ok) throw new Error(`Demo replacement of ${replacement.part}: ${outcome.reason}`);
    lastEventId = outcome.eventId;
    current.set(replacement.part, { ...part, id: outcome.newComponentId });
  }

  // Rules of /design: from the built-in templates, plus the owner's own for the Float X.
  const templates = listRuleTemplates(ctx);
  const fromTemplate = (code: string) => {
    const found = templates.find((t) => t.code === code);
    if (!found) throw new Error(`Demo rule: no template ${code}`);
    return {
      title: found.title,
      intervalDistanceM: found.intervalDistanceM,
      intervalWearS: found.intervalWearS,
      intervalDays: found.intervalDays,
    };
  };
  const rules = new Map<string, number>();
  const addRule = (
    key: string,
    bikeName: string,
    data: Omit<Parameters<typeof createRule>[2], "warnRatio" | "active" | "notes">,
  ) => {
    const bike = bikes.get(bikeName);
    if (!bike) throw new Error(`Demo rule ${key}: no bike ${bikeName}`);
    const outcome = createRule(ctx, bike.id, {
      ...data,
      warnRatio: 0.9,
      active: true,
      notes: null,
    });
    if (!outcome.ok) throw new Error(`Demo rule ${key}: ${outcome.reason}`);
    rules.set(key, outcome.ruleId);
  };
  const purchase = (bikeName: string) =>
    startOfLocalDay(bikes.get(bikeName)!.purchasedOn, timeZone);

  addRule("s.lowers", "Spectral", {
    ...fromTemplate("rockshox_fork_lower_leg_service"),
    componentTypeCode: "fork",
    position: null,
    resetOnReplacement: true,
    counterStartAt: purchase("Spectral"),
  });
  addRule("s.sealant", "Spectral", {
    ...fromTemplate("tubeless_sealant_top_up"),
    componentTypeCode: "tire",
    position: "front",
    resetOnReplacement: true,
    counterStartAt: endOfLocalDay(day("2026-08-01"), timeZone),
  });
  addRule("s.chain", "Spectral", {
    ...fromTemplate("chain_wear_check"),
    componentTypeCode: "chain",
    position: null,
    resetOnReplacement: true,
    counterStartAt: purchase("Spectral"),
  });
  addRule("s.bleed", "Spectral", {
    ...fromTemplate("brake_bleed"),
    componentTypeCode: "brake",
    position: null,
    resetOnReplacement: true,
    counterStartAt: purchase("Spectral"),
  });
  addRule("g.chain", "Gravel alu", {
    ...fromTemplate("chain_wear_check"),
    componentTypeCode: "chain",
    position: null,
    resetOnReplacement: true,
    counterStartAt: purchase("Gravel alu"),
  });
  // Le Lourd's Float X: last serviced about 46 h of riding ago, so it shows as due soon.
  const lourd = bikes.get("Le Lourd");
  if (!lourd) throw new Error("Demo rule: no bike Le Lourd");
  let wear = 0;
  let lastServiced = purchase("Le Lourd");
  for (const ride of [...listRideUsages(ctx, lourd.id)].reverse()) {
    wear += rideWear(ride).wearS;
    lastServiced = ride.startedAt - 1;
    if (wear >= 46 * 3600) break;
  }
  addRule("l.float", "Le Lourd", {
    title: "Entretien de la chambre à air",
    componentTypeCode: "rear_shock",
    position: null,
    intervalDistanceM: null,
    intervalWearS: 50 * 3600,
    intervalDays: null,
    resetOnReplacement: true,
    counterStartAt: lastServiced,
  });

  for (const visit of SHOP_VISITS) {
    const bike = bikes.get(visit.bike);
    if (!bike) throw new Error(`Demo visit: no bike ${visit.bike}`);
    const outcome = createMaintenanceEvent(ctx, {
      bikeId: bike.id,
      performedOn: day(visit.on),
      title: visit.title,
      performedBy: "shop",
      shop: { name: "Cycles du Lac", kind: "physical" },
      totalCostCents: visit.totalCents,
      notes: null,
      recordedAt: now,
      lines: visit.lines.map((line) => ({
        action: line.action,
        componentId: line.part ? (current.get(line.part)?.id ?? null) : null,
        ruleId: line.rule ? (rules.get(line.rule) ?? null) : null,
        description: line.description,
        costCents: null,
        measurementValue: null,
        measurementUnit: null,
      })),
    });
    if (!outcome.ok) throw new Error(`Demo visit ${visit.title}: ${outcome.reason}`);
  }
  // One-off tasks of /design (D-34).
  for (const task of [
    { bike: "Spectral", title: "Vérifier le serrage des pivots", dueOn: day("2026-10-31") },
    { bike: "Gravel alu", title: "Dévoiler la roue arrière", dueOn: null },
  ]) {
    const created = createTask(ctx, {
      bikeId: bikes.get(task.bike)?.id ?? null,
      title: task.title,
      dueOn: task.dueOn,
      notes: null,
    });
    if (!created.ok) throw new Error(`Demo task ${task.title}: ${created.reason}`);
  }
}
