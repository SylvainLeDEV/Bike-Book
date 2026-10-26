import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-control border border-transparent font-semibold whitespace-nowrap no-underline select-none",
    "transition-[background-color,border-color,color,transform,opacity] active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[17px]",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-fg hover:bg-brand-hover",
        secondary:
          "border-border bg-surface text-fg shadow-(--shadow-sm) hover:bg-surface-2 aria-pressed:bg-surface-2",
        ghost: "bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg aria-pressed:text-fg",
        danger:
          "bg-late-soft text-late-ink hover:bg-[color-mix(in_oklch,var(--late-soft),var(--late)_14%)]",
        // A text link that keeps a 44 px hit area on touch screens without moving the layout.
        link: "relative h-auto border-0 bg-transparent px-0 py-1 font-medium text-brand-ink hover:underline hover:underline-offset-3 active:translate-y-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2.5",
      },
      size: {
        sm: "h-[34px] px-3 text-[13px] pointer-coarse:min-h-11",
        md: "h-10 px-4 text-sm pointer-coarse:min-h-11",
        lg: "h-12 px-4 text-[15px]",
        icon: "size-10 px-0 pointer-coarse:size-11 [&_svg:not([class*='size-'])]:size-[18px]",
        inline: "text-sm",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Renders the child (a link, for instance) with the button's look. */
    asChild?: boolean;
  };

function Button({
  className,
  variant = "primary",
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  const resolvedSize = size ?? (variant === "link" ? "inline" : "md");
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size: resolvedSize }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
