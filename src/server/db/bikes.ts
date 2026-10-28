import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import type { BikeStatus, Discipline, ShopKind, WheelSize } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import { cleanName, nameKey } from "@/lib/names";
import type { AccessContext } from "./access-context";
import { getDb, type Tx } from "./client";
import { resolveShopId } from "./shops";
import { bikes, shops } from "./schema";

// Bikes and shops of the current workspace (D-25). Every function filters on ctx.workspace.id:
// a bike or shop of another workspace is invisible and cannot be changed.

export type Bike = {
  id: number;
  name: string;
  discipline: Discipline;
  isElectric: boolean;
  brand: string | null;
  model: string | null;
  modelYear: number | null;
  frameSize: string | null;
  wheelSize: WheelSize | null;
  color: string | null;
  frameSerial: string | null;
  weightG: number | null;
  purchasedOn: LocalDate | null;
  purchasePriceCents: number | null;
  purchaseShop: { id: number; name: string; kind: ShopKind } | null;
  boughtUsed: boolean;
  initialDistanceM: number;
  initialWearS: number;
  status: BikeStatus;
  statusChangedOn: LocalDate | null;
  salePriceCents: number | null;
  notes: string | null;
  /** The main photo (feature 10, D-75), changed through the attachments only. */
  coverAttachmentId: number | null;
  createdAt: Date;
};

/** What a save writes: validated input plus the resolved status columns. */
export type BikeData = Omit<Bike, "id" | "purchaseShop" | "createdAt" | "coverAttachmentId"> & {
  /** Matched by name among the workspace's shops; a new name creates the shop. */
  purchaseShop: { name: string; kind: ShopKind } | null;
};

export type SaveBikeOutcome =
  | { ok: true; bikeId: number }
  /** `takenBy`: the name of the bike that already has it. */
  | { ok: false; reason: "name_taken"; takenBy: string }
  | { ok: false; reason: "not_found" };

const bikeColumns = {
  id: bikes.id,
  name: bikes.name,
  discipline: bikes.discipline,
  isElectric: bikes.isElectric,
  brand: bikes.brand,
  model: bikes.model,
  modelYear: bikes.modelYear,
  frameSize: bikes.frameSize,
  wheelSize: bikes.wheelSize,
  color: bikes.color,
  frameSerial: bikes.frameSerial,
  weightG: bikes.weightG,
  purchasedOn: bikes.purchasedOn,
  purchasePriceCents: bikes.purchasePriceCents,
  boughtUsed: bikes.boughtUsed,
  initialDistanceM: bikes.initialDistanceM,
  initialWearS: bikes.initialWearS,
  status: bikes.status,
  statusChangedOn: bikes.statusChangedOn,
  salePriceCents: bikes.salePriceCents,
  notes: bikes.notes,
  coverAttachmentId: bikes.coverAttachmentId,
  createdAt: bikes.createdAt,
  shopId: shops.id,
  shopName: shops.name,
  shopKind: shops.kind,
};

/** Bikes of the workspace with their purchase shop; one bike when `bikeId` is given. */
function selectBikes(ctx: AccessContext, bikeId?: number) {
  return getDb()
    .select(bikeColumns)
    .from(bikes)
    .leftJoin(shops, eq(shops.id, bikes.purchaseShopId))
    .where(
      and(
        eq(bikes.workspaceId, ctx.workspace.id),
        bikeId == null ? undefined : eq(bikes.id, bikeId),
      ),
    );
}

type BikeRow = NonNullable<ReturnType<ReturnType<typeof selectBikes>["get"]>>;

function toBike({ shopId, shopName, shopKind, ...bike }: BikeRow): Bike {
  return {
    ...bike,
    purchaseShop:
      shopId != null && shopName != null && shopKind != null
        ? { id: shopId, name: shopName, kind: shopKind }
        : null,
  };
}

/** Every bike of the workspace, in the order they were added. */
export function listBikes(ctx: AccessContext): Bike[] {
  return selectBikes(ctx).orderBy(asc(bikes.id)).all().map(toBike);
}

/** One bike of the workspace, or null (unknown id, or another workspace's bike). */
export function getBike(ctx: AccessContext, bikeId: number): Bike | null {
  const row = selectBikes(ctx, bikeId).get();
  return row ? toBike(row) : null;
}

/** The other bike of the workspace that already has this name (case and accents ignored). */
function bikeNamed(
  tx: Tx,
  ctx: AccessContext,
  name: string,
  exceptBikeId?: number,
): string | undefined {
  const key = nameKey(name);
  return tx
    .select({ name: bikes.name })
    .from(bikes)
    .where(
      and(
        eq(bikes.workspaceId, ctx.workspace.id),
        exceptBikeId == null ? undefined : ne(bikes.id, exceptBikeId),
      ),
    )
    .all()
    .find((row) => nameKey(row.name) === key)?.name;
}

/** Adds a bike to the workspace, creating its shop if needed, in one transaction. */
export function createBike(ctx: AccessContext, data: BikeData): SaveBikeOutcome {
  return getDb().transaction((tx) => {
    const takenBy = bikeNamed(tx, ctx, data.name);
    if (takenBy != null) return { ok: false, reason: "name_taken", takenBy };
    const { purchaseShop, ...fields } = data;
    const purchaseShopId = resolveShopId(tx, ctx, purchaseShop);
    const { id } = tx
      .insert(bikes)
      .values({
        ...fields,
        name: cleanName(fields.name),
        purchaseShopId,
        workspaceId: ctx.workspace.id,
      })
      .returning({ id: bikes.id })
      .get();
    return { ok: true, bikeId: id };
  });
}

/** Changes a bike of the workspace. Another workspace's bike is "not_found" and stays as is. */
export function updateBike(ctx: AccessContext, bikeId: number, data: BikeData): SaveBikeOutcome {
  return getDb().transaction((tx) => {
    const owned = tx
      .select({ id: bikes.id })
      .from(bikes)
      .where(and(eq(bikes.workspaceId, ctx.workspace.id), eq(bikes.id, bikeId)))
      .get();
    if (!owned) return { ok: false, reason: "not_found" };
    const takenBy = bikeNamed(tx, ctx, data.name, bikeId);
    if (takenBy != null) return { ok: false, reason: "name_taken", takenBy };
    const { purchaseShop, ...fields } = data;
    const purchaseShopId = resolveShopId(tx, ctx, purchaseShop);
    tx.update(bikes)
      .set({ ...fields, name: cleanName(fields.name), purchaseShopId })
      .where(and(eq(bikes.workspaceId, ctx.workspace.id), eq(bikes.id, bikeId)))
      .run();
    return { ok: true, bikeId };
  });
}
