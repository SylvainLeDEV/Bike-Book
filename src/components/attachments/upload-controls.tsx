"use client";

import * as React from "react";
import { cn } from "cn";
import { CircleAlert, FileUp, LoaderCircle, X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { formatFileSize, formatPercent } from "@/lib/format";
import { UPLOAD_ACCEPT } from "@/lib/uploads";
import type { UploadRow } from "./use-uploads";

/**
 * A button that opens the file picker (several files at once unless `single`): photos and PDFs
 * everywhere (D-74), `accept` without HEIC (D-46, D-73).
 */
export function UploadButton({
  onFiles,
  single = false,
  children,
  ...props
}: Omit<ButtonProps, "onClick" | "asChild"> & {
  onFiles: (files: File[]) => void;
  single?: boolean;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <Button {...props} onClick={() => input.current?.click()}>
        {children}
      </Button>
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple={!single}
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Reset, so that choosing the same file again fires a change.
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

/** The files on their way, each with its progress bar, or its reason when refused. */
export function UploadRows({
  rows,
  onDismiss,
  className,
}: {
  rows: UploadRow[];
  onDismiss: (key: number) => void;
  className?: string;
}) {
  if (!rows.length) return null;
  return (
    <ul className={cn("m-0 grid list-none gap-2 p-0", className)} aria-label="Envois en cours">
      {rows.map((row) => {
        const percent = Math.round(row.progress * 100);
        const failed = row.status === "error";
        return (
          <li
            key={row.key}
            className={cn(
              "grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-card border bg-surface p-2.5",
              failed ? "border-late" : "border-border",
            )}
          >
            <span
              className={cn(
                "grid size-10 place-items-center rounded-[10px]",
                failed ? "bg-late-soft text-late-ink" : "bg-surface-2 text-fg-muted",
              )}
            >
              {failed ? (
                <CircleAlert className="size-5" aria-hidden />
              ) : row.status === "uploading" ? (
                <LoaderCircle
                  className="size-5 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <FileUp className="size-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{row.name}</p>
              {failed ? (
                <p className="text-[13px] leading-snug text-late-ink" role="alert">
                  {row.error}
                </p>
              ) : (
                <>
                  <p className="text-[13px] text-fg-muted">
                    {formatFileSize(row.sizeBytes)} ·{" "}
                    {row.status === "waiting"
                      ? "en attente"
                      : `envoi ${formatPercent(row.progress)}`}
                  </p>
                  <div
                    role="progressbar"
                    aria-label={`Envoi de ${row.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track"
                  >
                    <span
                      className="block h-full rounded-full bg-brand transition-[width] duration-200 motion-reduce:transition-none"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={failed ? `Retirer ${row.name}` : `Annuler l'envoi de ${row.name}`}
              onClick={() => onDismiss(row.key)}
            >
              <X />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
