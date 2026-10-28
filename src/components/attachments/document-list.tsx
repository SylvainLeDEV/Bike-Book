"use client";

import * as React from "react";
import { ExternalLink, FileText, Pencil } from "lucide-react";
import { usePhotoViewer } from "@/components/photos/photo-viewer";
import { Button } from "@/components/ui/button";
import { formatDate, formatFileSize } from "@/lib/format";
import { ATTACHMENT_KIND_LABELS } from "@/lib/labels";
import type { AttachmentVM } from "@/lib/view-models";
import { AttachmentEditor } from "./attachment-editor";
import { documentOrigin } from "./origin";
import { useAttachmentService } from "./service";

/**
 * Invoices, manuals and other documents (D-74): a PDF opens in a new tab (the browser's viewer,
 * or a download), an image document in the viewer. With `showOrigin`, each line names its
 * element ("Facture — Entretien du 12 mars"), as on the bike page.
 */
export function DocumentList({
  documents,
  showOrigin = false,
  onChanged,
}: {
  documents: AttachmentVM[];
  showOrigin?: boolean;
  /** After an edit or a delete, for lists the parent holds itself. */
  onChanged?: (updated: AttachmentVM | null, previous: AttachmentVM) => void;
}) {
  const service = useAttachmentService();
  const viewer = usePhotoViewer();
  const [editing, setEditing] = React.useState<number | null>(null);
  if (!documents.length) return null;
  const images = documents.filter((doc) => doc.isImage);

  return (
    <ul className="m-0 list-none divide-y divide-border p-0">
      {documents.map((doc) => {
        const label = doc.caption ?? doc.name;
        const meta = [
          showOrigin ? documentOrigin(doc) : ATTACHMENT_KIND_LABELS[doc.kind],
          doc.isImage ? "Image" : "PDF",
          formatFileSize(doc.sizeBytes),
          formatDate(doc.addedOn, { month: "short" }),
        ].join(" · ");
        return (
          <li key={doc.id} className="py-2.5">
            <div className="flex min-h-10 items-center gap-3">
              {doc.isImage && doc.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler
                <img
                  src={doc.thumbUrl}
                  alt=""
                  className="size-9 shrink-0 rounded-[10px] object-cover"
                />
              ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-muted">
                  <FileText className="size-[18px]" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold [overflow-wrap:anywhere]">{label}</p>
                <p className="text-[13px] text-fg-muted">{meta}</p>
              </div>
              {service ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Modifier ${label}`}
                  aria-expanded={editing === doc.id}
                  onClick={() => setEditing(editing === doc.id ? null : doc.id)}
                >
                  <Pencil />
                </Button>
              ) : null}
              {doc.isImage && viewer ? (
                <Button
                  variant="ghost"
                  size="icon"
                  data-photo-id={doc.id}
                  aria-label={`Voir ${label}`}
                  onClick={() => viewer.open({ title: "Documents", photos: images }, doc.id)}
                >
                  <ExternalLink />
                </Button>
              ) : (
                <Button variant="ghost" size="icon" asChild>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Ouvrir ${label}, nouvel onglet`}
                  >
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </div>
            {editing === doc.id ? (
              <div className="mt-2.5 rounded-card bg-surface-2 p-3">
                <AttachmentEditor
                  attachment={doc}
                  onCancel={() => setEditing(null)}
                  onSaved={(updated) => {
                    setEditing(null);
                    onChanged?.(updated, doc);
                  }}
                  onDeleted={() => {
                    setEditing(null);
                    onChanged?.(null, doc);
                  }}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
