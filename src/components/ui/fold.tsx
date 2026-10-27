"use client";

import { ChevronRight } from "lucide-react";

/**
 * A folded part of a form ("Détails", "Achat"): a disclosure whose state the form controls, so
 * it can open itself on a field with an error.
 */
export function Fold({
  open,
  onOpenChange,
  title,
  hint,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group border-t border-border pt-1"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary className="flex min-h-11 list-none items-center gap-2 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-[18px] transition-transform group-open:rotate-90"
          aria-hidden
        />
        {title} <span className="hint">{hint}</span>
      </summary>
      <div className="grid gap-4 pt-1.5 pb-1">{children}</div>
    </details>
  );
}
