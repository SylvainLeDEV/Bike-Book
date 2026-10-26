import { cn } from "cn";

/**
 * A radio choice shown as a card (the part taken from stock): icon, name, details and a dot
 * that marks the choice, so it never relies on colour alone.
 */
export function ChoiceCard({
  icon,
  title,
  meta,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "title"> & {
  icon: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <label className={cn("relative block", className)}>
      <input type="radio" className="peer sr-only" {...props} />
      <span
        className={cn(
          "grid min-h-[60px] cursor-pointer grid-cols-[36px_minmax(0,1fr)_20px] items-center gap-x-3 rounded-card border border-border bg-surface px-3.5 py-2.5 transition-[background-color,border-color]",
          "hover:border-[color-mix(in_oklch,var(--border),var(--fg)_25%)]",
          "peer-checked:border-brand peer-checked:bg-brand-soft",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-55",
          "[&_[data-dot]]:grid [&_[data-dot]]:size-5 [&_[data-dot]]:place-items-center [&_[data-dot]]:rounded-full [&_[data-dot]]:border-2 [&_[data-dot]]:border-fg-muted",
          "peer-checked:[&_[data-dot]]:border-brand peer-checked:[&_[data-dot]]:after:size-2.5 peer-checked:[&_[data-dot]]:after:rounded-full peer-checked:[&_[data-dot]]:after:bg-brand peer-checked:[&_[data-dot]]:after:content-['']",
          "peer-checked:[&_[data-icon]]:bg-surface peer-checked:[&_[data-icon]]:text-brand-ink",
        )}
      >
        <span
          data-icon
          className="grid size-9 place-items-center rounded-[10px] bg-surface-2 text-fg-muted [&_svg]:size-[18px]"
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-[14.5px] font-semibold">{title}</span>
          {meta ? <span className="block text-[13px] text-fg-muted">{meta}</span> : null}
        </span>
        <span data-dot aria-hidden />
      </span>
    </label>
  );
}
