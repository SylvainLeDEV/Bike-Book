"use client";

import * as React from "react";
import {
  AttachmentServiceProvider,
  type AttachmentService,
} from "@/components/attachments/service";
import { useToast } from "@/components/ui/toast";
import { MAX_UPLOAD_BYTES, UPLOAD_ERROR_MESSAGES } from "@/lib/uploads";
import type { AttachmentVM } from "@/lib/view-models";
import { SPECTRAL_DOCUMENTS, SPECTRAL_PHOTOS } from "./fixtures";

/*
 * Attachments on /design (feature 10): the fixtures in memory, uploads simulated with a
 * progress that moves, nothing sent anywhere. A picked image is shown from the browser's own
 * memory (object URL); HEIC and other formats are refused by their name, as a stand-in for the
 * server's content check.
 */

const DemoContext = React.createContext<AttachmentVM[]>([]);

/** The demo's attachments, for the bike page's gallery and documents. */
export function useDemoAttachments() {
  return React.useContext(DemoContext);
}

export function DemoAttachmentProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [list, setList] = React.useState<AttachmentVM[]>(() => [
    ...SPECTRAL_PHOTOS,
    ...SPECTRAL_DOCUMENTS,
  ]);
  const listRef = React.useRef(list);
  React.useEffect(() => {
    listRef.current = list;
  }, [list]);
  const nextId = React.useRef(900);

  const service = React.useMemo<AttachmentService>(
    () => ({
      list: async (owner) =>
        listRef.current.filter((a) => a.origin.kind === owner.kind && a.origin.id === owner.id),
      upload: (owner, file, { onProgress, signal, asCover }) =>
        new Promise((resolve) => {
          if (file.size > MAX_UPLOAD_BYTES) {
            return resolve({ ok: false, error: UPLOAD_ERROR_MESSAGES.too_large });
          }
          if (/\.(heic|heif)$/i.test(file.name)) {
            return resolve({ ok: false, error: UPLOAD_ERROR_MESSAGES.heic });
          }
          const isImage = /^image\/(jpeg|png|webp)$/.test(file.type);
          if (!isImage && file.type !== "application/pdf") {
            return resolve({ ok: false, error: UPLOAD_ERROR_MESSAGES.unsupported });
          }
          let progress = 0;
          const timer = setInterval(() => {
            progress = Math.min(1, progress + 0.2);
            onProgress(progress);
            if (progress < 1) return;
            clearInterval(timer);
            const id = nextId.current++;
            const url = URL.createObjectURL(file);
            const today = new Date().toISOString().slice(0, 10);
            const owned = listRef.current.find(
              (a) => a.origin.kind === owner.kind && a.origin.id === owner.id,
            );
            const vm: AttachmentVM = {
              id,
              kind: isImage ? "photo" : "invoice",
              isImage,
              name: file.name,
              sizeBytes: file.size,
              caption: null,
              alt: isImage ? "Photo ajoutée" : file.name,
              takenOn: isImage ? today : null,
              takenTime: isImage ? "12:00" : null,
              addedOn: today,
              thumbUrl: isImage ? url : null,
              url,
              downloadUrl: url,
              origin: owned?.origin ?? { ...owner, title: "", on: null },
              bikeName: owned?.bikeName ?? "Spectral",
              isCover: false,
            };
            setList((current) => [
              ...current.map((a) => (asCover && isImage ? { ...a, isCover: false } : a)),
              { ...vm, isCover: Boolean(asCover && isImage) },
            ]);
            resolve({ ok: true, id });
          }, 160);
          signal.addEventListener("abort", () => {
            clearInterval(timer);
            resolve({ ok: false, error: "Envoi annulé." });
          });
        }),
      update: async (id, edit) => {
        setList((current) =>
          current.map((a) =>
            a.id === id
              ? {
                  ...a,
                  ...edit,
                  takenOn: edit.takenOn ?? a.takenOn,
                  takenTime: edit.takenTime ?? a.takenTime,
                }
              : a,
          ),
        );
        toast("Pièce jointe modifiée");
        return { ok: true };
      },
      remove: async (id) => {
        setList((current) => current.filter((a) => a.id !== id));
        toast("Pièce jointe supprimée");
        return { ok: true };
      },
      setCover: async (id, on) => {
        setList((current) =>
          current.map((a) =>
            a.id === id ? { ...a, isCover: on } : on ? { ...a, isCover: false } : a,
          ),
        );
        toast(on ? "Photo principale du vélo changée" : "Photo principale retirée");
        return { ok: true };
      },
      changed: () => {},
    }),
    [toast],
  );

  return (
    <DemoContext.Provider value={list}>
      <AttachmentServiceProvider service={service}>{children}</AttachmentServiceProvider>
    </DemoContext.Provider>
  );
}
