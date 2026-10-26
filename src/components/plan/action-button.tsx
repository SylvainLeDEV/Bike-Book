"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * A button that runs an action passed by the page with a payload: a Server Action in the app
 * (both serialise across the server/client boundary), a toast on /design. Disabled while the
 * action runs; rendered disabled when there is no action.
 *
 * When the action removes the button's own row ("Fait" on a task), the keyboard focus moves to
 * the `[data-focus-fallback]` control of the enclosing `[data-focus-scope]` instead of being
 * lost on the page body.
 */
export function ActionButton<T>({
  action,
  payload,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  action?: (payload: T) => void | Promise<void>;
  payload: T;
}) {
  const [pending, startTransition] = React.useTransition();
  const ref = React.useRef<HTMLButtonElement>(null);
  return (
    <Button
      {...props}
      ref={ref}
      disabled={props.disabled || pending || !action}
      aria-busy={pending || undefined}
      onClick={() => {
        if (!action) return;
        const scope = ref.current?.closest<HTMLElement>("[data-focus-scope]");
        startTransition(async () => {
          await action(payload);
          requestAnimationFrame(() => {
            if (ref.current?.isConnected) return;
            scope?.querySelector<HTMLElement>("[data-focus-fallback]")?.focus();
          });
        });
      }}
    />
  );
}
