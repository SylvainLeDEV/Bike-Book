"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { CreateApiTokenResult, EditResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { issueToken } from "@/server/auth/tokens";
import { revokeApiToken } from "@/server/db";
import { apiTokenInputSchema } from "./api-token-input";

/**
 * "Créer le jeton" (D-90): a personal token for an external assistant, for the signed-in user
 * in the current workspace. The token is in this answer only; the database keeps its hash.
 */
export async function createApiTokenAction(input: unknown): Promise<CreateApiTokenResult> {
  const ctx = await requireAccessContext();
  const parsed = apiTokenInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: { name: parsed.error.issues[0]?.message } };
  }
  const { token } = issueToken(ctx, parsed.data.name);
  refresh();
  return { ok: true, token, name: parsed.data.name };
}

/** "Révoquer le jeton": it never works again (D-90). */
export async function revokeApiTokenAction(tokenId: unknown): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const id = z.number().int().positive().safeParse(tokenId);
  if (!id.success || !revokeApiToken(ctx, id.data)) {
    return { ok: false, error: "Jeton introuvable." };
  }
  refresh();
  return { ok: true, message: "Jeton révoqué" };
}
