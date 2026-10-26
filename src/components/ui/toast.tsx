"use client";

import * as React from "react";
import { CircleCheck } from "lucide-react";
import { Toast as ToastPrimitive } from "radix-ui";

/*
 * Toast after each action (D-30), with "Annuler" when the action can be undone. One toast at a
 * time: a new one replaces the previous. Radix announces it politely to screen readers, pauses
 * the timer on hover and focus, and F8 moves the keyboard focus to it.
 */

type ToastOptions = {
  /** Shows "Annuler"; called once if the person presses it. */
  undo?: () => void;
};

type ToastState = { id: number; message: string; undo?: () => void };

const ToastContext = React.createContext<
  ((message: string, options?: ToastOptions) => void) | null
>(null);

const DURATION_MS = 4500;
const DURATION_WITH_UNDO_MS = 7000;

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const [open, setOpen] = React.useState(false);
  const counter = React.useRef(0);

  const show = React.useCallback((message: string, options: ToastOptions = {}) => {
    counter.current += 1;
    setToast({ id: counter.current, message, undo: options.undo });
    setOpen(true);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <ToastPrimitive.Provider swipeDirection="down" label="Notifications">
        {children}
        {toast ? (
          <ToastPrimitive.Root
            key={toast.id}
            open={open}
            onOpenChange={setOpen}
            duration={toast.undo ? DURATION_WITH_UNDO_MS : DURATION_MS}
            className="pointer-events-auto flex w-max max-w-full items-center gap-2.5 rounded-[14px] bg-toast-bg py-2 pr-2 pl-3.5 text-sm font-medium text-toast-fg shadow-(--shadow-lg) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-[10px] data-[swipe=end]:animate-out data-[swipe=end]:fade-out-0 data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y) motion-safe:duration-[240ms]"
          >
            <CircleCheck className="size-[18px] shrink-0 text-toast-ok" aria-hidden />
            <ToastPrimitive.Description className="min-w-0 py-2">
              {toast.message}
            </ToastPrimitive.Description>
            {toast.undo ? (
              <ToastPrimitive.Action
                altText="Annuler la dernière action"
                className="h-[34px] shrink-0 rounded-lg px-2.5 font-semibold text-toast-action hover:bg-[color-mix(in_oklch,var(--toast-bg),var(--toast-fg)_10%)] pointer-coarse:h-11"
                onClick={() => {
                  const undo = toast.undo;
                  setToast((current) => (current ? { ...current, undo: undefined } : current));
                  undo?.();
                }}
              >
                Annuler
              </ToastPrimitive.Action>
            ) : null}
          </ToastPrimitive.Root>
        ) : null}
        {/* Phone: centred above the bottom bar. From 700 px: bottom right. */}
        <ToastPrimitive.Viewport className="pointer-events-none fixed inset-x-4 bottom-[calc(92px+env(safe-area-inset-bottom))] z-[60] m-0 flex list-none justify-center p-0 outline-none md:inset-x-auto md:right-6 md:bottom-6 md:justify-end" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

/** `toast("Sortie ajoutée", { undo })` from any client component inside the shell. */
function useToast() {
  const show = React.useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}

export { ToastProvider, useToast };
