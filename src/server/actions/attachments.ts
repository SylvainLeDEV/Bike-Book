"use server";

import { refresh } from "next/cache";
import type { AttachmentVM } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { deleteAttachment, setAttachmentCover, updateAttachment } from "@/server/db";
import { getEnv } from "@/server/env";
import { ownerAttachments } from "@/server/views/attachments";
import {
  attachmentEditSchema,
  attachmentIdSchema,
  ownerSchema,
  toAttachmentPatch,
} from "./attachment-input";

// Attachments (feature 10): reading one element's list, editing, covers, deleting. Uploads go
// through the Route Handler /api/uploads, never through an action (body size limit, 04).

type Result = { ok: true } | { ok: false; error: string };

const NOT_FOUND = "Pièce jointe introuvable.";

/** The "Pièces jointes" block of one element; null when it is not in the workspace. */
export async function listAttachmentsAction(owner: unknown): Promise<AttachmentVM[] | null> {
  const ctx = await requireAccessContext();
  const parsed = ownerSchema.safeParse(owner);
  return parsed.success ? ownerAttachments(ctx, parsed.data) : null;
}

/** Caption, kind and date taken. */
export async function updateAttachmentAction(id: unknown, input: unknown): Promise<Result> {
  const ctx = await requireAccessContext();
  const parsedId = attachmentIdSchema.safeParse(id);
  const parsed = attachmentEditSchema.safeParse(input);
  if (!parsedId.success) return { ok: false, error: NOT_FOUND };
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const outcome = updateAttachment(
    ctx,
    parsedId.data,
    toAttachmentPatch(parsed.data, getEnv().timeZone),
  );
  if (!outcome.ok) {
    return {
      ok: false,
      error: outcome.reason === "invalid" ? "Un PDF ne peut pas être une photo." : NOT_FOUND,
    };
  }
  refresh();
  return { ok: true };
}

/** "Choisir comme photo principale" / "Retirer" (D-75). */
export async function setAttachmentCoverAction(id: unknown, on: unknown): Promise<Result> {
  const ctx = await requireAccessContext();
  const parsedId = attachmentIdSchema.safeParse(id);
  if (!parsedId.success || typeof on !== "boolean") return { ok: false, error: NOT_FOUND };
  const outcome = setAttachmentCover(ctx, parsedId.data, on);
  if (!outcome.ok) {
    return {
      ok: false,
      error:
        outcome.reason === "invalid"
          ? "Seule une photo de l'élément peut être sa photo."
          : NOT_FOUND,
    };
  }
  refresh();
  return { ok: true };
}

/** Deletes the file and its copies, after the confirmation of the sheet (D-70). */
export async function deleteAttachmentAction(id: unknown): Promise<Result> {
  const ctx = await requireAccessContext();
  const parsedId = attachmentIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: NOT_FOUND };
  if (!deleteAttachment(ctx, parsedId.data).ok) return { ok: false, error: NOT_FOUND };
  refresh();
  return { ok: true };
}
