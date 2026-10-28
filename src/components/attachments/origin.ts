import { formatDate } from "@/lib/format";
import { ATTACHMENT_KIND_LABELS } from "@/lib/labels";
import type { AttachmentVM } from "@/lib/view-models";

/** Where an attachment comes from, in a few words: "Vélo", "Entretien du 12 mars"… */
export function originLabel(attachment: Pick<AttachmentVM, "origin">): string {
  const { kind, on } = attachment.origin;
  const day = on ? formatDate(on, { month: "short", year: "never" }) : "";
  switch (kind) {
    case "bike":
      return "Vélo";
    case "component":
      return "Composant";
    case "maintenance_event":
      return day ? `Entretien du ${day}` : "Entretien";
    case "ride":
      return day ? `Sortie du ${day}` : "Sortie";
    case "task":
      return "Tâche";
    case "inventory_item":
      return "Atelier";
  }
}

/**
 * A document's line on the bike page (D-74): its kind and its element, "Facture — Entretien du
 * 12 mars", or "Notice — Composant : Amortisseur RockShox".
 */
export function documentOrigin(attachment: Pick<AttachmentVM, "kind" | "origin">): string {
  const kind = ATTACHMENT_KIND_LABELS[attachment.kind];
  const { kind: owner, title } = attachment.origin;
  if (owner === "bike") return `${kind} — Vélo`;
  const where = originLabel(attachment);
  return owner === "component" || owner === "task"
    ? `${kind} — ${where} : ${title}`
    : `${kind} — ${where}`;
}
