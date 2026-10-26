"use client";

import * as React from "react";
import { cn } from "cn";

/*
 * Bike page sections (D-48): tabs below 1024 px (phone and tablet), two columns from 1024 px.
 * Every section is rendered once; below 1024 px only the selected tab's panels show. The tab
 * bar scrolls sideways when the labels do not fit; arrow keys, Home and End move between tabs.
 */

export type BikeTabId = "plan" | "components" | "history" | "record" | "photos";

const TABS: { id: BikeTabId; label: string }[] = [
  { id: "plan", label: "À prévoir" },
  { id: "components", label: "Composants" },
  { id: "history", label: "Historique" },
  { id: "record", label: "Fiche" },
  { id: "photos", label: "Photos" },
];

type TabsContextValue = { selected: BikeTabId; select: (id: BikeTabId) => void };
const TabsContext = React.createContext<TabsContextValue | null>(null);

/** Selects a tab from elsewhere (the photo viewer's "Voir dans l'historique"). */
export function useBikeTabs() {
  return React.useContext(TabsContext);
}

export function BikeTabs({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = React.useState<BikeTabId>("plan");
  const value = React.useMemo(() => ({ selected, select: setSelected }), [selected]);
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function BikeTabList() {
  const context = React.useContext(TabsContext)!;
  const refs = React.useRef<Partial<Record<BikeTabId, HTMLButtonElement | null>>>({});

  function move(event: React.KeyboardEvent, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const id = TABS[next].id;
    context.select(id);
    refs.current[id]?.focus();
  }

  // Keep the selected tab visible in the scrolling bar (not on first render: no page jump).
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    refs.current[context.selected]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [context.selected]);

  return (
    <div
      role="tablist"
      aria-label="Sections du vélo"
      className="mt-5 mb-4 no-scrollbar flex gap-0.5 overflow-x-auto rounded-xl bg-surface-2 p-[3px] lg:hidden"
    >
      {TABS.map((tab, index) => {
        const isSelected = tab.id === context.selected;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`bike-tab-${tab.id}`}
            aria-selected={isSelected}
            aria-controls={`bike-panel-${tab.id}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => context.select(tab.id)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "h-[38px] flex-[1_0_auto] rounded-[9px] px-3 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors pointer-coarse:h-11",
              isSelected
                ? "bg-surface font-semibold text-fg shadow-(--shadow-sm)"
                : "hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** The sections of one tab. From 1024 px it is always shown, in its column. */
export function BikeTabPanel({
  tab,
  className,
  children,
}: {
  tab: BikeTabId;
  className?: string;
  children: React.ReactNode;
}) {
  const context = React.useContext(TabsContext)!;
  return (
    <div
      role="tabpanel"
      id={`bike-panel-${tab}`}
      aria-labelledby={`bike-tab-${tab}`}
      className={cn("grid gap-[26px]", context.selected !== tab && "max-lg:hidden", className)}
    >
      {children}
    </div>
  );
}
