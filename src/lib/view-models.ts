/**
 * View models: what the screens receive as props. The /design route fills them with fixtures,
 * the real pages (phase 1 step B) with data from the data-access layer and the domain functions.
 *
 * Same conventions as the data (D-50): enum values in English as in docs/03, distances in
 * metres, durations in seconds, money in cents, calendar dates as `YYYY-MM-DD` (instants are
 * turned into local dates on the server, in TZ). Labels and formats are the screens' job.
 */
import type {
  BikeStatus,
  ComponentGroup,
  Discipline,
  InventoryCategory,
  InventoryUnit,
  MaintenancePerformer,
  MovementKind,
  RemovalReason,
  RestockStatus,
  RideConditions,
  RideType,
  RuleStatus,
  ShopKind,
  WheelSize,
} from "./enums";
import type { LocalDate } from "./format";

// --- Enums (values in enums.ts, defined in docs/03-data-model.md) ------------------------------

export type {
  BikeStatus,
  ComponentGroup,
  ComponentPosition,
  Discipline,
  InventoryCategory,
  InventoryUnit,
  MaintenancePerformer,
  MovementKind,
  RemovalReason,
  RestockStatus,
  RideConditions,
  RideType,
  RuleStatus,
  ShopKind,
  WheelSize,
} from "./enums";

/** What the workshop shows for an item: restocking first, else low stock (computed, D-35). */
export type RebuyState = "to_order" | "ordered" | "low_stock";

// --- Shared pieces ------------------------------------------------------------------------------

/** A value with its unit, for counters and rule intervals. */
export type Quantity =
  | { unit: "distance_m"; value: number }
  | { unit: "duration_s"; value: number }
  | { unit: "days"; value: number };

/** Placeholder art until the bike has a photo: one of the cover palettes. */
export type BikeCoverVM = { photoUrl: string | null; artIndex: number };

export type BikeRef = { id: number; name: string; cover: BikeCoverVM };

export type ShellUserVM = { name: string; email: string; workspaceName: string };

// --- "À prévoir": rules and one-off tasks -------------------------------------------------------

export type RuleRowVM = {
  id: number;
  bike: BikeRef;
  /** The slot the rule targets; null for a bike-level rule. */
  slot: { group: ComponentGroup; typeLabel: string; model: string | null } | null;
  title: string;
  status: RuleStatus;
  /** Highest of the interval ratios (1.13 = 113 %). */
  ratio: number;
  warnRatio: number;
  /** The interval that drives the ratio, with the usage since the last reset. */
  used: Quantity;
  interval: Quantity;
  /** Day-based rules: the date it falls due. */
  dueOn: LocalDate | null;
  /** Projection from the last 8 weeks (Estimate); null when there is not enough riding. */
  etaDays: number | null;
  lastDoneOn: LocalDate | null;
  /** The workshop part this slot needs, when one is linked and to rebuy. */
  stock: {
    itemId: number;
    name: string;
    quantity: number;
    unit: InventoryUnit;
    state: RebuyState | null;
  } | null;
};

export type TaskRowVM = {
  id: number;
  bike: BikeRef | null;
  title: string;
  dueOn: LocalDate | null;
};

// --- Timeline (rides and maintenance) ------------------------------------------------------------

export type PhotoOrigin = "bike" | "component" | "maintenance_event" | "ride";

export type PhotoVM = {
  id: number;
  /** Square thumbnail and full-size image. */
  thumbUrl: string;
  url: string;
  caption: string | null;
  /** Alternative text when there is no caption, generated from the linked element. */
  alt: string;
  takenOn: LocalDate;
  /** The one element the photo belongs to (D-45). */
  origin: { kind: PhotoOrigin; id: number; title: string; on: LocalDate | null };
  bikeName: string;
};

export type RideItemVM = {
  kind: "ride";
  id: number;
  on: LocalDate;
  bikeName: string;
  rideType: RideType;
  title: string;
  distanceM: number | null;
  /** Moving time, else total time. */
  durationS: number | null;
  totalTimeS: number | null;
  elevationGainM: number | null;
  runsCount: number | null;
  /** Lift-assisted rides: the wear counted (D-13), when it differs from the duration shown. */
  wearS: number | null;
  conditions: RideConditions | null;
  photos: PhotoVM[];
};

export type MaintenanceItemVM = {
  kind: "maintenance";
  id: number;
  on: LocalDate;
  bikeName: string;
  performedBy: MaintenancePerformer;
  shopName: string | null;
  title: string;
  totalCostCents: number | null;
  note: string | null;
  invoices: { id: number; name: string }[];
  photos: PhotoVM[];
};

export type TimelineItemVM = RideItemVM | MaintenanceItemVM;

// --- Dashboard -----------------------------------------------------------------------------------

export type BikeCardVM = {
  bike: BikeRef;
  discipline: Discipline;
  isElectric: boolean;
  /** Shown on the card, with its date, when it is not `active`. */
  status: BikeStatus;
  statusChangedOn: LocalDate | null;
  monthDistanceM: number;
  monthDurationS: number;
  /** The most urgent rule status and how many rules have it; null when all is up to date. */
  alert: { status: Exclude<RuleStatus, "ok" | "snoozed">; count: number } | null;
};

export type RebuyRowVM = {
  itemId: number;
  name: string;
  bikes: BikeRef[] | "all";
  state: RebuyState;
  /** Why it matters now: a late or due-soon rule needs it, the order date, what is left… */
  reason:
    | { kind: "rule"; status: "overdue" | "due_soon"; neededOn: LocalDate | null }
    | { kind: "ordered"; orderedOn: LocalDate; priceCents: number | null }
    | { kind: "low_stock"; quantity: number; unit: InventoryUnit }
    | { kind: "price"; priceCents: number | null };
};

export type DashboardVM = {
  today: LocalDate;
  firstName: string;
  counts: { overdue: number; dueSoon: number; toRebuy: number };
  rules: RuleRowVM[];
  tasks: TaskRowVM[];
  bikes: BikeCardVM[];
  rebuy: RebuyRowVM[];
  activity: TimelineItemVM[];
};

// --- Bike page -------------------------------------------------------------------------------------

export type ComponentVM = {
  id: number;
  typeLabel: string;
  model: string;
  /** Worst status of the rules on this slot, shown as a small mark. */
  status: RuleStatus | null;
  counter: Quantity;
  /** null: fitted since the bike was bought ("d'origine"). */
  installedOn: LocalDate | null;
  photos: PhotoVM[];
  /** The parts this slot had before, the original one first (origin = stock). */
  lineage: {
    model: string;
    removedOn: LocalDate;
    wearAtRemoval: Quantity;
    reason: RemovalReason;
    note: string | null;
    photos: PhotoVM[];
  }[];
};

export type ComponentGroupVM = { group: ComponentGroup; components: ComponentVM[] };

export type CostEventVM = {
  id: number;
  on: LocalDate;
  title: string;
  shopName: string | null;
  costCents: number;
};

export type TotalCostVM = {
  purchaseCents: number;
  shopCents: number;
  shopVisits: number;
  homeCents: number;
  homeEvents: number;
  saleCents: number | null;
  totalCents: number;
  /** Distance of the rides, without the distance at purchase (D-44). */
  riddenDistanceM: number;
  rideCount: number;
  per100KmCents: number | null;
  per100KmUpkeepCents: number | null;
  events: CostEventVM[];
};

export type BikeRecordVM = {
  identity: {
    brand: string | null;
    model: string | null;
    modelYear: number | null;
    discipline: Discipline;
    frameSize: string | null;
    wheelSize: WheelSize | null;
    color: string | null;
    weightG: number | null;
    isElectric: boolean;
  };
  purchase: {
    purchasedOn: LocalDate | null;
    priceCents: number | null;
    shop: { name: string; kind: ShopKind } | null;
    boughtUsed: boolean;
    initialDistanceM: number;
    initialWearS: number;
  };
  frameSerial: string | null;
  documents: { id: number; name: string; sizeBytes: number; addedOn: LocalDate; url: string }[];
  status: BikeStatus;
  statusChangedOn: LocalDate | null;
  cost: TotalCostVM;
};

export type InventoryRowVM = {
  id: number;
  name: string;
  category: InventoryCategory;
  bikes: BikeRef[] | "all";
  location: string | null;
  quantity: number;
  unit: InventoryUnit;
  state: RebuyState | null;
};

export type BikePageVM = {
  today: LocalDate;
  bike: BikeRef & {
    brand: string | null;
    model: string | null;
    modelYear: number | null;
    frameSize: string | null;
    discipline: Discipline;
    isElectric: boolean;
    status: BikeStatus;
  };
  stats: {
    distanceM: number;
    wearS: number;
    rideCount: number;
    daysSinceLastMaintenance: number | null;
    trackedSince: LocalDate;
  };
  rules: RuleRowVM[];
  tasks: TaskRowVM[];
  components: { purchasedOn: LocalDate | null; groups: ComponentGroupVM[] };
  stock: { rows: InventoryRowVM[]; total: number; toRebuy: number };
  history: TimelineItemVM[];
  record: BikeRecordVM;
  photos: PhotoVM[];
};

// --- Bikes list and bike sheet ----------------------------------------------------------------------

export type BikesPageVM = {
  /** Active bikes, in the order they were added. */
  active: BikeCardVM[];
  /** Stored, sold, stolen and retired bikes: folded on the list (docs/04). */
  others: BikeCardVM[];
};

/** A shop already known to the workspace, offered as a suggestion (D-37). */
export type ShopOption = { id: number; name: string; kind: ShopKind };

/**
 * What "Ajouter un vélo" / "Modifier le vélo" sends. Raw units like the data (D-50); the server
 * validates it again with Zod. `shop`: a known shop is matched by name, a new name creates it.
 */
export type BikeInput = {
  name: string;
  brand: string | null;
  model: string | null;
  modelYear: number | null;
  discipline: Discipline;
  isElectric: boolean;
  status: BikeStatus;
  /** Sale date, `sold` only; becomes `status_changed_on`. */
  soldOn: LocalDate | null;
  salePriceCents: number | null;
  frameSize: string | null;
  wheelSize: WheelSize | null;
  color: string | null;
  weightG: number | null;
  frameSerial: string | null;
  notes: string | null;
  purchasedOn: LocalDate | null;
  purchasePriceCents: number | null;
  shop: { name: string; kind: ShopKind } | null;
  boughtUsed: boolean;
  initialDistanceM: number;
  initialWearS: number;
};

/** The bike sheet in edit mode: the current values. */
export type BikeFormVM = BikeInput & { id: number; statusChangedOn: LocalDate | null };

/** Answer of the save action: field errors are keyed like `BikeInput` ("shop" for the shop). */
export type SaveBikeResult =
  | { ok: true; bikeId: number; name: string }
  | { ok: false; error?: string; fieldErrors?: Partial<Record<keyof BikeInput, string>> };

// --- Workshop ------------------------------------------------------------------------------------

export type PurchaseLinkVM = {
  id: number;
  shopName: string;
  shopKind: ShopKind;
  /** Shown and opened in a new tab, never fetched by the server (D-09). */
  url: string | null;
  priceCents: number | null;
  lastPurchasedOn: LocalDate | null;
  priceNotedOn: LocalDate | null;
};

export type MovementVM = {
  id: number;
  kind: MovementKind;
  quantityDelta: number;
  occurredOn: LocalDate;
  /** Shop for a purchase, bike for a use during maintenance, else a short origin. */
  source: string | null;
  detail: string | null;
  maintenance: { bikeId: number; title: string } | null;
};

export type InventoryItemVM = InventoryRowVM & {
  kind: "part";
  brand: string | null;
  reference: string | null;
  componentTypeCode: string | null;
  lowStockThreshold: number | null;
  /** Unit cost of the latest purchase movement: the cost of a part taken from stock (D-38). */
  lastUnitCostCents: number | null;
  restock: {
    status: RestockStatus;
    quantity: number | null;
    changedOn: LocalDate | null;
    orderedOn: LocalDate | null;
    shopName: string | null;
  };
  purchaseLinks: PurchaseLinkVM[];
  rulesServed: {
    ruleId: number;
    bike: BikeRef;
    title: string;
    status: RuleStatus;
    used: Quantity;
    interval: Quantity;
    dueOn: LocalDate | null;
  }[];
  lastUse: { on: LocalDate; bikeName: string; title: string } | null;
  movements: MovementVM[];
  notes: string | null;
};

export type WorkshopVM = {
  today: LocalDate;
  bikes: BikeRef[];
  items: InventoryItemVM[];
};

/** "Remplacer une pièce" on one bike: its slots and what the workshop has for them. */
export type ReplacePartVM = {
  bike: BikeRef;
  slots: {
    componentId: number;
    label: string;
    componentTypeCode: string;
    fitted: { model: string; counter: Quantity };
  }[];
  stock: InventoryItemVM[];
};

// --- Quick ride entry ------------------------------------------------------------------------------

export type QuickRideVM = {
  today: LocalDate;
  bikes: (BikeRef & { usualRideType: RideType })[];
  /** The bike of the last ride, chosen by default. */
  defaultBikeId: number | null;
  /** Places of previous rides, most used first. */
  recentLocations: string[];
};

export type QuickRideInput = {
  bikeId: number;
  on: LocalDate;
  rideType: RideType;
  durationS: number | null;
  totalTimeS: number | null;
  descentTimeS: number | null;
  runsCount: number | null;
  distanceM: number | null;
  elevationGainM: number | null;
  conditions: RideConditions | null;
  location: string | null;
  notes: string | null;
};

export type ReplacePartInput = {
  removedComponentId: number;
  reason: Exclude<RemovalReason, "sold_with_bike">;
  removalNote: string | null;
  /** A workshop item (stock −1, D-33) or a part typed by hand ("Autre pièce, hors atelier"). */
  fromItemId: number | null;
  brand: string | null;
  model: string;
  priceCents: number | null;
};

/** "Ajouter un objet", parts only in phase 1 (D-33). */
export type AddItemInput = {
  name: string;
  brand: string | null;
  reference: string | null;
  category: InventoryCategory;
  componentTypeCode: string | null;
  /** "all", or the ids of the bikes it serves (none is allowed). */
  bikes: "all" | number[];
  quantity: number;
  unit: InventoryUnit;
  lowStockThreshold: number | null;
  location: string | null;
  link: { shopName: string | null; url: string | null; priceCents: number | null } | null;
  notes: string | null;
};

/** Component types a part can fit, for the workshop's "Type de pièce" (docs/03). */
export type ComponentTypeOption = { code: string; label: string };
