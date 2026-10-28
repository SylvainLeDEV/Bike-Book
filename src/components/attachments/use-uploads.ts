"use client";

import * as React from "react";
import { useAttachmentService, type AttachmentOwnerRef } from "./service";

export type UploadRow = {
  key: number;
  name: string;
  sizeBytes: number;
  /** 0 to 1. */
  progress: number;
  status: "waiting" | "uploading" | "error";
  error: string | null;
};

/** Two files at a time: enough to keep the line busy, few enough to show steady progress. */
const PARALLEL = 2;

/**
 * The upload queue of one place ("Ajouter", "Joindre un document"…): one request per file, each
 * with its own row, progress and error (feature 10). Finished files leave the list; refused ones
 * stay with their reason until removed. The page data is refreshed once the queue is empty.
 */
export function useUploads(owner: AttachmentOwnerRef, options: { onUploaded?: () => void } = {}) {
  const service = useAttachmentService();
  const [rows, setRows] = React.useState<UploadRow[]>([]);
  const queue = React.useRef<{ key: number; file: File; asCover: boolean }[]>([]);
  const running = React.useRef(0);
  const succeeded = React.useRef(0);
  const counter = React.useRef(0);
  const controllers = React.useRef(new Map<number, AbortController>());
  const onUploaded = React.useRef(options.onUploaded);
  React.useEffect(() => {
    onUploaded.current = options.onUploaded;
  });

  const patch = React.useCallback((key: number, changes: Partial<UploadRow>) => {
    setRows((list) => list.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }, []);

  // The next file starts when one finishes: through a ref, the callback cannot name itself.
  const pumpRef = React.useRef<() => void>(() => {});
  const pump = React.useCallback(() => {
    if (!service) return;
    while (running.current < PARALLEL && queue.current.length) {
      const next = queue.current.shift()!;
      running.current += 1;
      const controller = new AbortController();
      controllers.current.set(next.key, controller);
      patch(next.key, { status: "uploading" });
      service
        .upload(owner, next.file, {
          asCover: next.asCover,
          signal: controller.signal,
          onProgress: (progress) => patch(next.key, { progress }),
        })
        .then((result) => {
          if (result.ok) {
            succeeded.current += 1;
            setRows((list) => list.filter((row) => row.key !== next.key));
          } else {
            patch(next.key, { status: "error", error: result.error, progress: 0 });
          }
        })
        .finally(() => {
          controllers.current.delete(next.key);
          running.current -= 1;
          if (running.current === 0 && !queue.current.length && succeeded.current) {
            succeeded.current = 0;
            service.changed();
            onUploaded.current?.();
          }
          pumpRef.current();
        });
    }
  }, [owner, patch, service]);
  React.useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const add = React.useCallback(
    (files: Iterable<File>, asCover = false) => {
      const added: UploadRow[] = [];
      for (const file of files) {
        counter.current += 1;
        const key = counter.current;
        queue.current.push({ key, file, asCover });
        added.push({
          key,
          name: file.name,
          sizeBytes: file.size,
          progress: 0,
          status: "waiting",
          error: null,
        });
      }
      setRows((list) => [...list, ...added]);
      pump();
    },
    [pump],
  );

  /** Removes a refused row, or cancels a file that is waiting or on its way. */
  const dismiss = React.useCallback((key: number) => {
    queue.current = queue.current.filter((entry) => entry.key !== key);
    controllers.current.get(key)?.abort();
    setRows((list) => list.filter((row) => row.key !== key));
  }, []);

  // Leaving the screen cancels what is still on its way.
  React.useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  return { rows, add, dismiss, enabled: service != null };
}
