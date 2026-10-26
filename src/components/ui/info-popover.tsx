"use client";

import { Info } from "lucide-react";
import { Popover } from "radix-ui";

/** A small "i" that explains a figure (principle 2: every number can be explained). */
export function InfoPopover({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="relative inline-grid size-6 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5"
      >
        <Info className="size-[15px]" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-72 rounded-control border border-border bg-popover p-3 text-[13.5px] leading-snug text-popover-foreground shadow-(--shadow-md) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
