import "server-only";
import { z } from "zod";
import { ATTACHMENT_OWNERS, DOCUMENT_KINDS } from "@/lib/enums";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from "@/lib/uploads";
import type { AttachmentVM } from "@/lib/view-models";
import { attachmentEditSchema, toAttachmentPatch } from "@/server/actions/attachment-input";
import { createUploadLink } from "@/server/auth/upload-links";
import {
  atomically,
  coverOf,
  deleteAttachment,
  getAttachment,
  ownsAttachmentTarget,
  previewWrite,
  setAttachmentCover,
  updateAttachment,
  type AccessContext,
  type AttachmentOwner,
} from "@/server/db";
import { getEnv } from "@/server/env";
import { ownerAttachments } from "@/server/views/attachments";
import {
  answer,
  defineTool,
  dryRunInput,
  fieldErrorsOf,
  logWrite,
  refused,
  ToolRefusal,
} from "../tool";

// Attachments (feature 10, D-73 to D-76) through the MCP (D-99): photos and PDFs of an element.
// Files never travel through the MCP: get_upload_link answers a signed link of /api/uploads, and
// the assistant sends the file from the owner's computer (curl), checked as any upload (content
// type from the bytes, 25 MB, upright copies without metadata). Then list, caption, cover, delete.

const COVERABLE = new Set(["bike", "inventory_item"]);

const ownerInput = {
  owner_kind: z
    .enum(ATTACHMENT_OWNERS)
    .describe(
      "bike, component, maintenance_event, ride, task, inventory_item (a workshop item), procedure, procedure_step, procedure_run_step.",
    ),
  owner_id: z.number().describe("The element's id."),
};

const ownerOf = (args: { owner_kind: AttachmentOwner["kind"]; owner_id: number }) => ({
  kind: args.owner_kind,
  id: args.owner_id,
});

const notFound = () =>
  refused([{ field: "owner_id", message: "Cet élément n'existe plus." }], "Unknown element.");

/** An attachment as the tools answer it; its pages open in the owner's signed-in browser. */
function describeAttachment(vm: AttachmentVM, coverId: number | null) {
  const base = getEnv().publicUrl;
  return {
    id: vm.id,
    kind: vm.kind,
    is_image: vm.isImage,
    name: vm.name,
    size_bytes: vm.sizeBytes,
    caption: vm.caption,
    taken_on: vm.takenOn,
    taken_time: vm.takenTime,
    added_on: vm.addedOn,
    is_cover: coverId === vm.id,
    url: `${base}${vm.url}`,
  };
}

function attachmentsOf(ctx: AccessContext, owner: AttachmentOwner) {
  const list = ownerAttachments(ctx, owner);
  if (!list) return null;
  const cover = COVERABLE.has(owner.kind) ? coverOf(ctx, owner) : null;
  return list.map((vm) => describeAttachment(vm, cover));
}

// --- get_upload_link -----------------------------------------------------------------------------

const getUploadLinkTool = defineTool({
  name: "get_upload_link",
  title: "Lien d'envoi d'un fichier",
  kind: "read",
  description: `A link to send photos or PDFs to one element from the owner's computer: the file never goes through these tools. Send each file as the raw body of a POST to url, with the link in X-Upload-Link and its name in X-File-Name (URL-encoded): curl -sS -X POST --data-binary @"<path>" -H "X-Upload-Link: <link>" -H "X-File-Name: <name>" "<url>". Never write the link into a file or a URL. The answer is 201 {"id": <attachment id>}, else {"error", "message"} in French; error link_invalid (401): the link has expired, its token was revoked, or it is another element's: ask for a new link. The link works for that element for 15 minutes, for several files, and stops if the token is revoked. Accepted: ${UPLOAD_ACCEPT} (checked from the content), ${MAX_UPLOAD_BYTES / 1024 / 1024} MB at most; HEIC is refused: convert it first (macOS: sips -s format jpeg in.heic --out out.jpg). as_cover: the first photo sent becomes the element's photo (a bike or a workshop item). A photo sent from the phone to Claude Code is saved under ~/.claude/uploads/. Then update_attachment sets its caption or kind (invoice, manual).`,
  input: z.strictObject({
    ...ownerInput,
    as_cover: z
      .boolean()
      .optional()
      .describe("A bike or a workshop item: a photo sent becomes its photo."),
  }),
  run: (ctx, args) => {
    const owner = ownerOf(args);
    if (!ownsAttachmentTarget(ctx, owner)) return notFound();
    if (args.as_cover && !COVERABLE.has(owner.kind)) {
      return refused(
        [{ field: "as_cover", message: "Seuls un vélo ou un objet de l'atelier ont une photo." }],
        "No link was made.",
      );
    }
    const link = createUploadLink(ctx, owner, { asCover: args.as_cover });
    return answer(`Upload link for ${owner.kind} ${owner.id}, valid 15 minutes.`, {
      url: link.url,
      method: "POST",
      headers: { "X-Upload-Link": link.link, "X-File-Name": "<URL-encoded file name>" },
      expires_at: new Date(link.expiresAt).toISOString(),
      max_bytes: MAX_UPLOAD_BYTES,
      accepted: UPLOAD_ACCEPT.split(","),
    });
  },
});

// --- list_attachments ----------------------------------------------------------------------------

const listAttachmentsTool = defineTool({
  name: "list_attachments",
  title: "Pièces jointes d'un élément",
  kind: "read",
  description:
    "The photos and PDFs of one element, oldest first: kind (photo, invoice, manual, other), file name, size, caption, the day and time a photo was taken, whether it is the element's photo (a bike or a workshop item), and its page (opens in the owner's signed-in browser).",
  input: z.strictObject(ownerInput),
  run: (ctx, args) => {
    const list = attachmentsOf(ctx, ownerOf(args));
    if (!list) return notFound();
    return answer(`${list.length} attachment(s).`, { attachments: list });
  },
});

// --- update_attachment ---------------------------------------------------------------------------

const updateAttachmentTool = defineTool({
  name: "update_attachment",
  title: "Modifier une pièce jointe",
  kind: "write",
  description:
    "Changes an attachment's caption, kind (photo for an image only; invoice, manual, other), or the day and time a photo was taken (local, HH:MM); is_cover makes a photo the element's photo or removes it (a bike or a workshop item). Only the fields given change. Call with dry_run true first.",
  input: z.strictObject({
    attachment_id: z.number().describe("The attachment (list_attachments, or the upload's id)."),
    caption: z.string().nullable().optional(),
    kind: z.enum(["photo", ...DOCUMENT_KINDS]).optional(),
    taken_on: z.string().nullable().optional().describe("YYYY-MM-DD."),
    taken_time: z.string().nullable().optional().describe("HH:MM, local time."),
    is_cover: z.boolean().optional(),
    dry_run: dryRunInput,
  }),
  run: (ctx, { attachment_id: id, dry_run: dryRun, is_cover: isCover, ...args }) => {
    const REFUSED = "The attachment was refused; nothing was written.";
    const current = getAttachment(ctx, id);
    if (!current) {
      return refused(
        [{ field: "attachment_id", message: "Pièce jointe introuvable." }],
        "Unknown attachment.",
      );
    }
    const vm = (ownerAttachments(ctx, current.owner) ?? []).find((a) => a.id === id)!;
    const parsed = attachmentEditSchema.safeParse({
      caption: args.caption === undefined ? vm.caption : args.caption,
      kind: args.kind ?? vm.kind,
      takenOn: args.taken_on === undefined ? vm.takenOn : args.taken_on,
      takenTime: args.taken_time === undefined ? vm.takenTime : args.taken_time,
    });
    if (!parsed.success) return refused(fieldErrorsOf(parsed.error.issues), REFUSED);
    const editing =
      args.caption !== undefined ||
      args.kind !== undefined ||
      args.taken_on !== undefined ||
      args.taken_time !== undefined;
    const write = () => {
      if (editing) {
        const outcome = updateAttachment(
          ctx,
          id,
          toAttachmentPatch(parsed.data, getEnv().timeZone),
        );
        if (!outcome.ok) {
          throw new ToolRefusal(
            [
              outcome.reason === "invalid"
                ? { field: "kind", message: "Un PDF ne peut pas être une photo." }
                : { field: "attachment_id", message: "Pièce jointe introuvable." },
            ],
            REFUSED,
          );
        }
      }
      if (isCover !== undefined) {
        const outcome = setAttachmentCover(ctx, id, isCover);
        if (!outcome.ok) {
          throw new ToolRefusal(
            [{ field: "is_cover", message: "Seule une photo de l'élément peut être sa photo." }],
            REFUSED,
          );
        }
      }
      return attachmentsOf(ctx, current.owner)!.find((a) => a.id === id)!;
    };
    const after = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "update_attachment", { attachment_id: id });
    return answer(
      dryRun
        ? `Dry run: would change attachment ${id}. Nothing was written.`
        : `Changed attachment ${id}.`,
      { dry_run: dryRun, attachment: after, warnings: [] },
    );
  },
});

// --- delete_attachment ---------------------------------------------------------------------------

const deleteAttachmentTool = defineTool({
  name: "delete_attachment",
  title: "Supprimer une pièce jointe",
  kind: "delete",
  description:
    "Deletes a photo or a PDF sent by mistake, as the app's \"Supprimer\": the file and its copies, for good; an element's photo goes back to none (the dry run warns). The dry run says what would go; delete only once the owner has confirmed.",
  input: z.strictObject({
    attachment_id: z.number().describe("The attachment (list_attachments)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { attachment_id: id, dry_run: dryRun }) => {
    const current = getAttachment(ctx, id);
    if (!current) {
      return refused(
        [{ field: "attachment_id", message: "Pièce jointe introuvable." }],
        "Unknown attachment.",
      );
    }
    const described = attachmentsOf(ctx, current.owner)!.find((a) => a.id === id)!;
    const coverWarning = (would: boolean) =>
      described.is_cover
        ? [
            `This photo is the ${current.owner.kind === "bike" ? "bike" : "workshop item"}'s photo: it ${would ? "would have" : "now has"} none (update_attachment is_cover true makes another photo its photo).`,
          ]
        : [];
    // Never through previewWrite: the file is removed once the row is gone (D-76).
    if (dryRun) {
      return answer(`Dry run: would delete "${described.name}". Nothing was deleted.`, {
        dry_run: true,
        attachment: described,
        warnings: coverWarning(true),
      });
    }
    if (!deleteAttachment(ctx, id).ok) {
      return refused(
        [{ field: "attachment_id", message: "Pièce jointe introuvable." }],
        "Nothing was deleted.",
      );
    }
    logWrite(ctx, "delete_attachment", { attachment_id: id });
    return answer(`Deleted "${described.name}".`, {
      dry_run: false,
      attachment: described,
      warnings: coverWarning(false),
    });
  },
});

export const attachmentTools = [
  getUploadLinkTool,
  listAttachmentsTool,
  updateAttachmentTool,
  deleteAttachmentTool,
];
