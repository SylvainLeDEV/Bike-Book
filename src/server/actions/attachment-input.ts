import { z } from "zod";
import { ATTACHMENT_OWNERS, DOCUMENT_KINDS } from "@/lib/enums";
import { isLocalDate, localInstant } from "@/lib/format";
import type { AttachmentPatch } from "@/server/db";

// Inputs of the attachment actions (feature 10), validated before anything is written (D-50).

export const ownerSchema = z.object({
  kind: z.enum(ATTACHMENT_OWNERS),
  id: z.number().int().positive(),
});

export const attachmentIdSchema = z.number().int().positive();

export const attachmentEditSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(200, "200 caractères au maximum.")
    .nullable()
    .transform((value) => value || null),
  kind: z.enum(["photo", ...DOCUMENT_KINDS]),
  takenOn: z.string().refine(isLocalDate, "Date invalide.").nullable(),
  takenTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide.")
    .nullable(),
});

export type AttachmentEditInput = z.infer<typeof attachmentEditSchema>;

/** The edit as the data-access layer takes it: the date taken becomes an instant in TZ. */
export function toAttachmentPatch(input: AttachmentEditInput, timeZone: string): AttachmentPatch {
  const patch: AttachmentPatch = { caption: input.caption, kind: input.kind };
  if (input.takenOn) {
    // Without a time, noon: it exists on every day, clock changes included (as D-61).
    const [hour, minute] = (input.takenTime ?? "12:00").split(":").map(Number);
    patch.takenAt = localInstant(input.takenOn, { hour, minute }, timeZone);
  }
  return patch;
}
