import "server-only";
import type { UploadErrorCode } from "@/lib/uploads";
import {
  createAttachment,
  ownsAttachmentTarget,
  type AccessContext,
  type Attachment,
  type AttachmentOwner,
} from "@/server/db";
import {
  cleanOriginalName,
  defaultKind,
  FORMATS,
  readExifDates,
  resolveTakenAt,
} from "@/server/domain/attachments";
import { derivedFile, inspectImage } from "./images";
import { commitFile, discardFile, receiveFile, removeStoredFiles, UploadError } from "./storage";

export type UploadInput = {
  owner: AttachmentOwner;
  body: ReadableStream<Uint8Array>;
  /** The browser's file name (display only). */
  name: string | null;
  /** `File.lastModified`, sent apart: a raw or multipart body does not carry it (H-11). */
  lastModified: number | null;
  /** Make it the bike's or item's cover ("Changer la photo"). */
  asCover: boolean;
  timeZone: string;
  now?: number;
};

export type UploadOutcome =
  { ok: true; attachment: Attachment } | { ok: false; code: UploadErrorCode };

/**
 * One uploaded file, from the request body to its row (feature 10): the element is checked
 * first, then the body streams to a temporary file (format, size and SHA-256 checked on the
 * way), is renamed into `uploads/`, and an image must decode (its thumbnail is made at once).
 * Any failure leaves nothing behind, neither file nor row.
 */
export async function storeUpload(ctx: AccessContext, input: UploadInput): Promise<UploadOutcome> {
  if (!ownsAttachmentTarget(ctx, input.owner)) return { ok: false, code: "not_found" };
  const uploadedAt = input.now ?? Date.now();

  let received;
  try {
    received = await receiveFile(input.body);
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, code: error.reason };
    throw error;
  }

  const storagePath = await commitFile(received, uploadedAt).catch(async (error) => {
    await discardFile(received.tempPath);
    throw error;
  });
  const { image, mimeType } = FORMATS[received.format];

  let dimensions: { widthPx: number | null; heightPx: number | null } = {
    widthPx: null,
    heightPx: null,
  };
  let takenAt: number | null = null;
  if (image) {
    try {
      const inspected = await inspectImage(storagePath);
      await derivedFile(storagePath, "thumb");
      dimensions = { widthPx: inspected.widthPx, heightPx: inspected.heightPx };
      takenAt = resolveTakenAt({
        exif: readExifDates(inspected.exif),
        lastModified: input.lastModified,
        uploadedAt,
        timeZone: input.timeZone,
      });
    } catch {
      removeStoredFiles([storagePath]);
      return { ok: false, code: "unreadable" };
    }
  }

  const outcome = createAttachment(
    ctx,
    input.owner,
    {
      kind: defaultKind(received.format),
      storagePath,
      originalName: cleanOriginalName(input.name, received.format),
      mimeType,
      sizeBytes: received.sizeBytes,
      sha256: received.sha256,
      ...dimensions,
      takenAt,
      caption: null,
    },
    { asCover: input.asCover },
  );
  if (!outcome.ok) {
    // The element was deleted while the file was arriving.
    removeStoredFiles([storagePath]);
    return { ok: false, code: outcome.reason === "not_found" ? "not_found" : "invalid" };
  }
  return { ok: true, attachment: outcome.attachment };
}
