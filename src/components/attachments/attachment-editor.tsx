"use client";

import * as React from "react";
import { Check, Image as ImageIcon, ImageOff, Trash2 } from "lucide-react";
import { DeleteConfirm } from "@/components/delete-confirm";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input, NativeSelect } from "@/components/ui/field";
import type { AttachmentKind } from "@/lib/enums";
import { ATTACHMENT_KIND_LABELS } from "@/lib/labels";
import { allowedKinds } from "@/lib/uploads";
import type { AttachmentVM } from "@/lib/view-models";
import { useAttachmentService, type AttachmentEdit } from "./service";

/** Bikes and workshop items have a cover photo (D-75): a photo of their own. */
export function coverLabel(attachment: Pick<AttachmentVM, "origin">): string | null {
  const { kind } = attachment.origin;
  return kind === "bike"
    ? "Photo principale du vélo"
    : kind === "inventory_item"
      ? "Photo de l'article"
      : null;
}

/**
 * Edits one attachment (feature 10): caption, kind, date taken (images), cover, delete with the
 * sheets' confirmation (D-70). Used by the viewer and the document rows.
 */
export function AttachmentEditor({
  attachment,
  onSaved,
  onDeleted,
  onCancel,
}: {
  attachment: AttachmentVM;
  onSaved: (updated: AttachmentVM) => void;
  onDeleted: (attachment: AttachmentVM) => void;
  onCancel?: () => void;
}) {
  const service = useAttachmentService();
  const [caption, setCaption] = React.useState(attachment.caption ?? "");
  const [kind, setKind] = React.useState<AttachmentKind>(attachment.kind);
  const [takenOn, setTakenOn] = React.useState(attachment.takenOn ?? "");
  const [takenTime, setTakenTime] = React.useState(attachment.takenTime ?? "");
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!service) return null;

  const cover = coverLabel(attachment);
  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.error);
      return result.ok;
    } catch {
      setError("Enregistrement impossible. Vérifie la connexion et réessaie.");
      return false;
    } finally {
      setPending(false);
    }
  };

  async function save() {
    if (attachment.isImage && !takenOn) {
      setError("Indique la date de prise de vue.");
      return;
    }
    const edit: AttachmentEdit = {
      caption: caption.trim() || null,
      kind,
      takenOn: attachment.isImage ? takenOn : null,
      takenTime: attachment.isImage ? takenTime || null : null,
    };
    if (await run(() => service!.update(attachment.id, edit))) {
      onSaved({
        ...attachment,
        ...edit,
        takenOn: edit.takenOn ?? attachment.takenOn,
        takenTime: edit.takenTime ?? attachment.takenTime,
        isCover: attachment.isCover && kind === "photo",
      });
    }
  }

  async function toggleCover() {
    const on = !attachment.isCover;
    if (await run(() => service!.setCover(attachment.id, on))) {
      onSaved({ ...attachment, isCover: on });
    }
  }

  async function remove() {
    if (await run(() => service!.remove(attachment.id))) {
      onDeleted(attachment);
    }
  }

  return (
    // Not a <form>: the editor sits inside the sheets' own forms, and a nested submit would bubble
    // up and save the sheet. Enter in a field saves the attachment only.
    <div
      role="group"
      aria-label={attachment.isImage ? "Modifier la photo" : "Modifier le document"}
      className="grid gap-3"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.target as HTMLElement).matches("input")) {
          event.preventDefault();
          event.stopPropagation();
          void save();
        }
      }}
    >
      {error ? <FieldError>{error}</FieldError> : null}
      <Field label="Légende" hint="Facultative.">
        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={200}
          autoComplete="off"
          placeholder={
            attachment.isImage ? "Ex. Joints racleurs encrassés" : "Ex. Facture de l'atelier"
          }
        />
      </Field>
      <Field label="Type">
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)}>
          {allowedKinds(attachment.isImage).map((value) => (
            <option key={value} value={value}>
              {ATTACHMENT_KIND_LABELS[value]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {attachment.isImage ? (
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Prise le">
            <Input type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
          </Field>
          <Field label="Heure" hint="Facultative.">
            <Input type="time" value={takenTime} onChange={(e) => setTakenTime(e.target.value)} />
          </Field>
        </div>
      ) : null}
      {cover && attachment.kind === "photo" && kind === "photo" ? (
        <div>
          <Button variant="secondary" size="sm" disabled={pending} onClick={toggleCover}>
            {attachment.isCover ? <ImageOff /> : <ImageIcon />}
            {attachment.isCover
              ? `Retirer de « ${cover} »`
              : `Choisir comme ${cover.toLowerCase()}`}
          </Button>
        </div>
      ) : null}
      {confirming ? (
        <DeleteConfirm
          question={
            attachment.isImage
              ? "Supprimer cette photo ? Le fichier et ses copies seront effacés."
              : "Supprimer ce document ? Le fichier sera effacé."
          }
          confirmLabel={attachment.isImage ? "Supprimer la photo" : "Supprimer le document"}
          pending={pending}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => void save()}>
            <Check />
            Enregistrer
          </Button>
          {onCancel ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
              Annuler
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={pending}
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
            Supprimer…
          </Button>
        </div>
      )}
    </div>
  );
}
