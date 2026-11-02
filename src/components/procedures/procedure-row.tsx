import { CircleCheck, ListOrdered, PackageMinus, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BikesMeta } from "@/components/workshop/inventory-row";
import { formatDuration, formatInteger, plural } from "@/lib/format";
import type { BikeRef, ProcedureRowVM } from "@/lib/view-models";

/**
 * The one badge of a procedure's material (D-86): what is missing first, then low stock, else
 * ready. Neutrals and outline only: green, amber and red stay for wear (D-30).
 */
export function ReadinessBadge({
  readiness,
}: {
  readiness: NonNullable<ProcedureRowVM["readiness"]>;
}) {
  if (readiness.missing) {
    return (
      <Badge variant="outline">
        <PackageX aria-hidden />
        {readiness.label}
      </Badge>
    );
  }
  if (readiness.low) {
    return (
      <Badge variant="stock">
        <PackageMinus aria-hidden />
        {readiness.label}
      </Badge>
    );
  }
  return (
    <Badge>
      <CircleCheck aria-hidden />
      {readiness.label}
    </Badge>
  );
}

/**
 * One procedure in a list (the workshop's "Fiches", the bike page): its steps, bikes, duration and
 * the badge of its material for one bike. Rendered inside a link or a button by the caller.
 */
export function ProcedureRowContent({
  row,
  allBikes,
  archived = false,
}: {
  row: ProcedureRowVM;
  allBikes: BikeRef[];
  archived?: boolean;
}) {
  return (
    <>
      <span className="row-span-2 grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-muted [&_svg]:size-[18px]">
        <ListOrdered aria-hidden />
      </span>
      <span className="col-start-2 min-w-0 text-[14.5px] leading-[1.35] font-semibold">
        {row.title}
      </span>
      <span className="col-start-3 row-span-2 row-start-1 grid justify-items-end gap-1 text-right">
        <span className="num text-[19px] leading-none font-semibold">
          {formatInteger(row.stepCount)}
        </span>
        <span className="text-[12.5px] whitespace-nowrap text-fg-muted">
          {plural(row.stepCount, "étape", "étapes")}
        </span>
      </span>
      <span className="col-start-2 flex min-w-0 items-center gap-1.5 text-[13px] text-fg-muted [&_svg]:size-3.5 [&_svg]:shrink-0">
        <BikesMeta bikes={row.bikes} all={allBikes} />
        {row.estimatedDurationS ? (
          <>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">≈ {formatDuration(row.estimatedDurationS)}</span>
          </>
        ) : null}
      </span>
      {row.readiness || archived ? (
        <span className="col-span-2 col-start-2 mt-1.5 flex flex-wrap items-center gap-1.5">
          {archived ? <Badge variant="outline">Archivée</Badge> : null}
          {row.readiness ? <ReadinessBadge readiness={row.readiness} /> : null}
          {row.forBike && row.readiness ? <span className="hint">pour {row.forBike}</span> : null}
        </span>
      ) : null}
    </>
  );
}
