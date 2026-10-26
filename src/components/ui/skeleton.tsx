import { cn } from "cn";

/** Placeholder shown while content loads: a soft moving shimmer, still when motion is reduced. */
function Skeleton({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn(
        "block animate-[shimmer_1.3s_linear_infinite] rounded-lg bg-[linear-gradient(90deg,var(--surface-2)_0%,color-mix(in_oklch,var(--surface-2),var(--fg)_8%)_50%,var(--surface-2)_100%)] bg-size-[200%_100%] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

/** A rule-like row: icon square, two lines and a bar. */
function SkeletonRow() {
  return (
    <div className="grid grid-cols-[44px_1fr] gap-3 px-4 py-3.5">
      <Skeleton className="h-11" />
      <div className="grid gap-2">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-2" />
      </div>
    </div>
  );
}

export { Skeleton, SkeletonRow };
