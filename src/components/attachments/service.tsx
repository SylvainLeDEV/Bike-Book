"use client";

import * as React from "react";
import type { AttachmentKind, AttachmentOwnerKind } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import { MAX_UPLOAD_BYTES, UPLOAD_ERROR_MESSAGES, type UploadErrorCode } from "@/lib/uploads";
import type { AttachmentVM } from "@/lib/view-models";

/*
 * Everything the attachment screens do, behind one context (feature 10): the app wires it to
 * the Server Actions and the upload Route Handler, /design to fixtures. Without a provider the
 * screens are read-only.
 */

export type AttachmentOwnerRef = { kind: AttachmentOwnerKind; id: number };

export type AttachmentEdit = {
  caption: string | null;
  kind: AttachmentKind;
  /** Images only: the date and time taken, in TZ. */
  takenOn: LocalDate | null;
  takenTime: string | null;
};

export type ServiceResult = { ok: true } | { ok: false; error: string };

export type UploadResult = { ok: true; id: number } | { ok: false; error: string };

export type AttachmentService = {
  /** The attachments of one element, newest first; null when it is gone. */
  list: (owner: AttachmentOwnerRef) => Promise<AttachmentVM[] | null>;
  upload: (
    owner: AttachmentOwnerRef,
    file: File,
    options: { asCover?: boolean; onProgress: (fraction: number) => void; signal: AbortSignal },
  ) => Promise<UploadResult>;
  update: (id: number, edit: AttachmentEdit) => Promise<ServiceResult>;
  remove: (id: number) => Promise<ServiceResult>;
  setCover: (id: number, on: boolean) => Promise<ServiceResult>;
  /** After a change: the page's own data (gallery, covers, thumbnails) is read again. */
  changed: () => void;
};

const ServiceContext = React.createContext<AttachmentService | null>(null);

export function AttachmentServiceProvider({
  service,
  children,
}: {
  service: AttachmentService;
  children: React.ReactNode;
}) {
  return <ServiceContext.Provider value={service}>{children}</ServiceContext.Provider>;
}

export function useAttachmentService(): AttachmentService | null {
  return React.useContext(ServiceContext);
}

/**
 * Sends one file to POST /api/uploads as the raw body, with its progress (XMLHttpRequest: fetch
 * has no upload progress). `lastModified` goes apart, since the body does not carry it (H-11).
 */
export function uploadFile(
  owner: AttachmentOwnerRef,
  file: File,
  options: { asCover?: boolean; onProgress: (fraction: number) => void; signal: AbortSignal },
): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return Promise.resolve({ ok: false, error: UPLOAD_ERROR_MESSAGES.too_large });
  }
  const query = new URLSearchParams({
    owner: owner.kind,
    id: String(owner.id),
    lastModified: String(Math.round(file.lastModified || 0)),
  });
  if (options.asCover) query.set("cover", "1");
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads?${query}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: { id?: number; error?: UploadErrorCode; message?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // A proxy's own error page (413 from a reverse proxy, 502…).
      }
      if (xhr.status === 201 && typeof body.id === "number") {
        resolve({ ok: true, id: body.id });
      } else {
        const code = body.error ?? (xhr.status === 413 ? "too_large" : "invalid");
        resolve({ ok: false, error: body.message ?? UPLOAD_ERROR_MESSAGES[code] });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: UPLOAD_ERROR_MESSAGES.aborted });
    xhr.onabort = () => resolve({ ok: false, error: "Envoi annulé." });
    options.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
