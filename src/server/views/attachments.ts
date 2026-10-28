import "server-only";
import { slotLabel } from "@/lib/display";
import { localDateOf, localTimeOf, type LocalDate } from "@/lib/format";
import { RIDE_TYPE_LABELS } from "@/lib/labels";
import type { AttachmentVM, PhotoOrigin, PhotoVM } from "@/lib/view-models";
import {
  coverOf,
  describeOwner,
  listAttachments,
  listBikeAttachments,
  type AccessContext,
  type Attachment,
  type AttachmentOwner,
  type OwnerDescription,
} from "@/server/db";
import { getEnv } from "@/server/env";

// View models of the attachments (feature 10): the bike page's gallery and documents, the
// thumbnails of the history and the components, and the "Pièces jointes" block of each sheet.

/** Where the browser gets an attachment (GET /api/uploads/[id]). */
export function attachmentUrl(
  id: number,
  variant: "thumb" | "display" | "original" | "download",
): string {
  if (variant === "original") return `/api/uploads/${id}`;
  if (variant === "download") return `/api/uploads/${id}?download=1`;
  return `/api/uploads/${id}?size=${variant}`;
}

const ALT_PREFIX: Record<PhotoOrigin, string> = {
  bike: "Photo du vélo",
  component: "Photo du composant",
  maintenance_event: "Photo de l'entretien",
  ride: "Photo de la sortie",
  task: "Photo de la tâche",
  inventory_item: "Photo de l'article",
};

/** The element's title and date, as an attachment's origin shows them. */
export function ownerOrigin(
  owner: AttachmentOwner,
  description: OwnerDescription,
  timeZone: string,
): AttachmentVM["origin"] {
  const origin = (title: string, on: LocalDate | null = null) => ({ ...owner, title, on });
  switch (description.kind) {
    case "bike":
      return origin(description.bikeName ?? "");
    case "component": {
      const name = [description.brand, description.model].filter(Boolean).join(" ");
      return origin(`${slotLabel(description.typeCode, description.position)} ${name}`.trim());
    }
    case "maintenance_event":
      return origin(description.title, description.performedOn);
    case "ride":
      return origin(
        description.title ?? description.location ?? RIDE_TYPE_LABELS[description.rideType],
        localDateOf(description.startedAt, timeZone),
      );
    case "task":
      return origin(description.title);
    case "inventory_item":
      return origin(description.name);
  }
}

export function attachmentVM(
  attachment: Attachment,
  origin: AttachmentVM["origin"],
  bikeName: string | null,
  coverId: number | null,
  timeZone: string,
): AttachmentVM {
  const isImage = attachment.mimeType.startsWith("image/");
  return {
    id: attachment.id,
    kind: attachment.kind,
    isImage,
    name: attachment.originalName,
    sizeBytes: attachment.sizeBytes,
    caption: attachment.caption,
    alt: isImage
      ? `${ALT_PREFIX[origin.kind]}${origin.title ? ` « ${origin.title} »` : ""}`
      : attachment.originalName,
    takenOn: attachment.takenAt == null ? null : localDateOf(attachment.takenAt, timeZone),
    takenTime: attachment.takenAt == null ? null : localTimeOf(attachment.takenAt, timeZone),
    addedOn: localDateOf(attachment.createdAt, timeZone),
    thumbUrl: isImage ? attachmentUrl(attachment.id, "thumb") : null,
    url: attachmentUrl(attachment.id, isImage ? "display" : "original"),
    downloadUrl: attachmentUrl(attachment.id, "download"),
    origin,
    bikeName,
    isCover: coverId === attachment.id,
  };
}

/** A photo for the galleries: an image of kind `photo` (D-74). */
export function isPhoto(vm: AttachmentVM): vm is PhotoVM {
  return vm.isImage && vm.kind === "photo" && vm.thumbUrl != null && vm.takenOn != null;
}

/** Newest first by date taken (photos) or added (documents). */
function newestFirst(a: AttachmentVM, b: AttachmentVM): number {
  const key = (vm: AttachmentVM) => `${vm.takenOn ?? vm.addedOn} ${vm.takenTime ?? ""}`;
  return key(b).localeCompare(key(a)) || b.id - a.id;
}

/** The "Pièces jointes" block of one element, or null when it is not in the workspace. */
export function ownerAttachments(
  ctx: AccessContext,
  owner: AttachmentOwner,
): AttachmentVM[] | null {
  const { timeZone } = getEnv();
  const description = describeOwner(ctx, owner);
  const list = listAttachments(ctx, owner);
  if (!description || !list) return null;
  const origin = ownerOrigin(owner, description, timeZone);
  const coverId = coverOf(ctx, owner);
  return list
    .map((a) => attachmentVM(a, origin, description.bikeName, coverId, timeZone))
    .sort(newestFirst);
}

export type BikeAttachments = {
  photos: PhotoVM[];
  documents: AttachmentVM[];
  /** Per element, for the history entries and the components: `"<kind>:<id>"`. */
  byOwner: Map<string, AttachmentVM[]>;
};

export const ownerKey = (kind: PhotoOrigin, id: number) => `${kind}:${id}`;

/** Everything attached to a bike and its elements, each with its origin (D-45, D-74). */
export function bikeAttachments(
  ctx: AccessContext,
  bike: { id: number; coverAttachmentId: number | null },
): BikeAttachments {
  const { timeZone } = getEnv();
  const list = listBikeAttachments(ctx, bike.id) ?? [];
  const origins = new Map<string, { origin: AttachmentVM["origin"]; bikeName: string | null }>();
  const byOwner = new Map<string, AttachmentVM[]>();
  const all: AttachmentVM[] = [];
  for (const attachment of list) {
    const key = ownerKey(attachment.owner.kind, attachment.owner.id);
    let named = origins.get(key);
    if (!named) {
      const description = describeOwner(ctx, attachment.owner);
      if (!description) continue;
      named = {
        origin: ownerOrigin(attachment.owner, description, timeZone),
        bikeName: description.bikeName,
      };
      origins.set(key, named);
    }
    const vm = attachmentVM(
      attachment,
      named.origin,
      named.bikeName,
      bike.coverAttachmentId,
      timeZone,
    );
    all.push(vm);
    byOwner.set(key, [...(byOwner.get(key) ?? []), vm]);
  }
  all.sort(newestFirst);
  for (const entries of byOwner.values()) entries.sort(newestFirst);
  return {
    photos: all.filter(isPhoto),
    documents: all.filter((vm) => !isPhoto(vm)),
    byOwner,
  };
}
