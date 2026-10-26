import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * Small pill with an icon and a label. ok / soon / late are reserved for wear status; the
 * workshop's restocking states use brand, outline and stock (accent and neutrals only).
 */
const badgeVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-[9px] pl-[7px] text-xs leading-none font-semibold whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:stroke-[2.4]",
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-fg-muted",
        ok: "bg-ok-soft text-ok-ink",
        soon: "bg-soon-soft text-soon-ink",
        late: "bg-late-soft text-late-ink",
        brand: "bg-brand-soft text-brand-ink",
        outline: "bg-transparent text-fg-muted shadow-[inset_0_0_0_1px_var(--border)]",
        stock: "bg-surface-2 text-fg",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
