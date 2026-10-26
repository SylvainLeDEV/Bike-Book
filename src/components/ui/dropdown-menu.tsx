"use client";

import * as React from "react";
import { cn } from "cn";
import { DropdownMenu as Menu } from "radix-ui";

/** Menu opened from a button (the avatar). Arrow keys, Escape and focus return come from Radix. */
const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-56 rounded-control border border-border bg-popover p-1 text-popover-foreground shadow-(--shadow-md)",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[14.5px] outline-none select-none pointer-coarse:min-h-11",
        "data-highlighted:bg-surface-2 data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2.5 pt-2 pb-1.5", className)} {...props} />;
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
