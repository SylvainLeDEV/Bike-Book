import { cn } from "cn";
import { Card } from "@/components/ui/card";

/**
 * Empty state that points to the next action: an illustration, a title, one sentence and the
 * button that fills the screen. `compact` for "no match" inside a list.
 */
export function EmptyState({
  art,
  title,
  children,
  action,
  compact = false,
  className,
  headingLevel = 3,
}: {
  art?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Card
      className={cn(
        "grid justify-items-center text-center",
        compact ? "gap-2 px-5 py-[22px]" : "gap-2.5 px-5 py-7",
        className,
      )}
    >
      {art ? (
        <div className="grid h-[92px] w-[132px] place-items-center rounded-[26px] bg-brand-soft text-brand-ink [&_svg]:w-[92px]">
          {art}
        </div>
      ) : null}
      <Heading className={cn("text-[17px] leading-snug font-semibold", art && "mt-1.5")}>
        {title}
      </Heading>
      {children ? <div className="max-w-[36ch] text-sm text-fg-muted">{children}</div> : null}
      {action ? <div className="mt-1.5 grid justify-items-center gap-2.5">{action}</div> : null}
    </Card>
  );
}
