import "server-only";
import { eq } from "drizzle-orm";
import type { ShopKind } from "@/lib/enums";
import { cleanName, nameKey } from "@/lib/names";
import type { AccessContext } from "./access-context";
import { getDb, type Tx } from "./client";
import { shops } from "./schema";

/** Shops of the workspace, by name: the suggestions of the shop fields (D-55). */
export function listShops(ctx: AccessContext): { id: number; name: string; kind: ShopKind }[] {
  return getDb()
    .select({ id: shops.id, name: shops.name, kind: shops.kind })
    .from(shops)
    .where(eq(shops.workspaceId, ctx.workspace.id))
    .all()
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * The id of the workspace's shop with that name (case and accents ignored), created if new
 * (D-55). Internal to src/server/db: called inside the transaction of the row that uses it.
 */
export function resolveShopId(
  tx: Tx,
  ctx: AccessContext,
  shop: { name: string; kind: ShopKind } | null,
): number | null {
  if (!shop) return null;
  const name = cleanName(shop.name);
  const key = nameKey(name);
  const existing = tx
    .select({ id: shops.id, name: shops.name })
    .from(shops)
    .where(eq(shops.workspaceId, ctx.workspace.id))
    .all()
    .find((row) => nameKey(row.name) === key);
  if (existing) return existing.id;
  return tx
    .insert(shops)
    .values({ workspaceId: ctx.workspace.id, name, kind: shop.kind })
    .returning({ id: shops.id })
    .get().id;
}
