"use client";

import { InfoPopover } from "@/components/ui/info-popover";
import type { SuspensionTypeCode } from "@/lib/enums";
import { sagHowTo } from "@/lib/setup-advice";

/** The "i" of the sag (D-83): what to measure, step by step. */
export function SagHowTo({ typeCode }: { typeCode: SuspensionTypeCode }) {
  return (
    <InfoPopover label="Comment mesurer le SAG">
      <span className="block font-semibold">Mesurer le SAG</span>
      <span className="mt-1 grid gap-1">
        {sagHowTo(typeCode).map((step, index) => (
          <span key={step} className="grid grid-cols-[1.1rem_minmax(0,1fr)]">
            <span className="text-fg-muted">{index + 1}.</span>
            {step}
          </span>
        ))}
      </span>
    </InfoPopover>
  );
}
