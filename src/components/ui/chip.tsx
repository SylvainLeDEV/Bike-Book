import * as React from "react";
import { cn } from "cn";

/**
 * A choice shown as a pill: a real radio or checkbox (keyboard, forms, screen readers) with the
 * mockup's look. Selected: accent background and border, bold label.
 */
type ChipProps = Omit<React.ComponentProps<"input">, "type" | "size"> & {
  type?: "radio" | "checkbox";
  size?: "md" | "sm";
  children: React.ReactNode;
  className?: string;
};

function Chip({ type = "radio", size = "md", className, children, ...props }: ChipProps) {
  return (
    <label data-slot="chip" className={cn("relative inline-flex shrink-0", className)}>
      <input type={type} className="peer sr-only" {...props} />
      <span
        className={cn(
          "inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface font-medium whitespace-nowrap text-fg",
          "transition-[background-color,border-color,color] hover:border-[color-mix(in_oklch,var(--border),var(--fg)_25%)]",
          "peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:font-semibold peer-checked:text-brand-ink",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-55",
          "[&_svg]:size-4 [&_svg]:shrink-0",
          size === "md" ? "h-10 px-3.5 text-sm" : "h-9 px-3 text-[13.5px]",
          "pointer-coarse:h-11",
        )}
      >
        {children}
      </span>
    </label>
  );
}

/** A row of chips. `scroll`: one line that scrolls sideways (phone), bleeding to the edges. */
function ChipRow({
  scroll = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { scroll?: boolean }) {
  return (
    <div
      className={cn(
        "flex gap-2",
        scroll ? "no-scrollbar flex-nowrap overflow-x-auto py-0.5" : "flex-wrap",
        className,
      )}
      {...props}
    />
  );
}

/** A count inside a chip: "Pièces 7". */
function ChipCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="num text-[15px] leading-none font-semibold text-fg-muted in-[input:checked+*]:text-current">
      {children}
    </span>
  );
}

export { Chip, ChipCount, ChipRow };
