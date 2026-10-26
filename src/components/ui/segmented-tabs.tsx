"use client";

import * as React from "react";
import { cn } from "cn";
import { Tabs } from "radix-ui";

/**
 * Two or more views of the same content ("Monté aujourd'hui" / "Fiche d'origine"): a segmented
 * control with tab semantics. Arrow keys, Home and End move between tabs (Radix).
 */
const SegmentedTabs = Tabs.Root;
const SegmentedTabsContent = Tabs.Content;

function SegmentedTabsList({ className, ...props }: React.ComponentProps<typeof Tabs.List>) {
  return (
    <Tabs.List
      className={cn("flex gap-0.5 rounded-xl bg-surface-2 p-[3px]", className)}
      {...props}
    />
  );
}

function SegmentedTabsTrigger({ className, ...props }: React.ComponentProps<typeof Tabs.Trigger>) {
  return (
    <Tabs.Trigger
      className={cn(
        "h-[38px] flex-1 rounded-[9px] px-3 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors pointer-coarse:h-11",
        "hover:text-fg data-[state=active]:bg-surface data-[state=active]:font-semibold data-[state=active]:text-fg data-[state=active]:shadow-(--shadow-sm)",
        className,
      )}
      {...props}
    />
  );
}

export { SegmentedTabs, SegmentedTabsContent, SegmentedTabsList, SegmentedTabsTrigger };
