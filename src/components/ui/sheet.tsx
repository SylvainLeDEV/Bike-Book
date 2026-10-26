"use client";

import * as React from "react";
import { cn } from "cn";
import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "./button";

/*
 * Sheet: a bottom sheet under 700 px, a centred dialog from 700 px (D-30). Radix Dialog gives
 * the modal behaviour: the page behind is inert, Tab stays inside, Escape closes, and the focus
 * returns to the control that opened it.
 */

const Sheet = Dialog.Root;
const SheetTrigger = Dialog.Trigger;
const SheetClose = Dialog.Close;

type SheetContentProps = React.ComponentProps<typeof Dialog.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Label of the close button. */
  closeLabel?: string;
};

function SheetContent({
  title,
  description,
  closeLabel = "Fermer",
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: SheetContentProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim duration-[220ms] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Dialog.Content
        ref={contentRef}
        // Focus the field marked data-autofocus rather than the close button.
        onOpenAutoFocus={(event) => {
          opener.current = document.activeElement as HTMLElement | null;
          onOpenAutoFocus?.(event);
          if (event.defaultPrevented) return;
          const target = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
          if (target) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        // Sheets are often opened by code (the "+" of the bottom bar), not by a Radix trigger:
        // give the focus back to whatever had it when the sheet opened.
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          const target = opener.current;
          if (target?.isConnected && target !== document.body) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        // Without a description, tell Radix there is none on purpose.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed z-50 flex flex-col bg-surface shadow-(--shadow-lg) outline-none",
          // Phone: anchored to the bottom, slides up.
          "inset-x-0 bottom-0 max-h-[94dvh] rounded-t-sheet duration-[280ms] ease-out",
          "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
          // From 700 px: a dialog in the middle.
          "md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:max-h-[calc(100dvh-64px)] md:w-[min(580px,calc(100%-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-sheet md:duration-[220ms]",
          "md:data-[state=closed]:fade-out-0 md:data-[state=closed]:slide-out-to-bottom-0 md:data-[state=closed]:zoom-out-98 md:data-[state=open]:fade-in-0 md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=open]:zoom-in-98",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-[3px] bg-border md:hidden" />
        <div className="flex shrink-0 items-start justify-between gap-3 pt-2.5 pr-3 pb-3 pl-5 md:pt-[18px]">
          <div className="min-w-0">
            <Dialog.Title className="text-[21px] leading-tight font-[650] tracking-[-0.015em]">
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-0.5 hint">{description}</Dialog.Description>
            ) : null}
          </div>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label={closeLabel}>
              <X />
            </Button>
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

/** Scrolling middle part of a sheet. */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("grid min-h-0 gap-5 overflow-y-auto px-5 pt-1 pb-[18px]", className)}
      {...props}
    />
  );
}

/** Bottom bar of a sheet, above the iPhone home indicator. */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border bg-surface px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    />
  );
}

/** A form that fills the sheet: body scrolls, footer stays. */
function SheetForm({ className, ...props }: React.ComponentProps<"form">) {
  return <form noValidate className={cn("flex min-h-0 flex-1 flex-col", className)} {...props} />;
}

export { Sheet, SheetBody, SheetClose, SheetContent, SheetFooter, SheetForm, SheetTrigger };
