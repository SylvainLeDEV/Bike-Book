"use client";

import * as React from "react";
import { cn } from "cn";
import { replaceQuery, writeBikeTab, type BikeTabId } from "@/lib/bike-tabs";

/*
 * Bike page sections (D-48, D-78). Below 1024 px (phone and tablet): five tabs, only the selected
 * tab's panels show. From 1024 px: two tabs, "Vue d'ensemble" (the two columns) and "Historique"
 * (full width). Every section is rendered once. The selected tab is kept in the address
 * (`?tab=`). The bars scroll sideways when the labels do not fit; arrow keys, Home and End move
 * between tabs.
 */

export type { BikeTabId };

const TABS: { id: BikeTabId; label: string }[] = [
  { id: "plan", label: "À prévoir" },
  { id: "components", label: "Composants" },
  { id: "history", label: "Historique" },
  { id: "record", label: "Fiche" },
  { id: "photos", label: "Photos" },
];

type WideTabId = "overview" | "history";

const WIDE_TABS: { id: WideTabId; label: string }[] = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "history", label: "Historique" },
];

type TabsContextValue = { selected: BikeTabId; select: (id: BikeTabId) => void };
const TabsContext = React.createContext<TabsContextValue | null>(null);

/** Selects a tab from elsewhere (the photo viewer's "Voir dans l'historique", "Tout l'historique"). */
export function useBikeTabs() {
  return React.useContext(TabsContext);
}

export function BikeTabs({
  initial = "plan",
  children,
}: {
  /** `?tab=` on arrival. */
  initial?: BikeTabId;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = React.useState<BikeTabId>(initial);
  const value = React.useMemo(
    () => ({
      selected,
      select: (id: BikeTabId) => {
        setSelected(id);
        replaceQuery((params) => writeBikeTab(params, id));
      },
    }),
    [selected],
  );
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

function TabBar<T extends string>({
  tabs,
  selected,
  onSelect,
  idPrefix,
  controls,
  className,
}: {
  tabs: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
  idPrefix: string;
  controls: (id: T) => string;
  className?: string;
}) {
  const refs = React.useRef<Partial<Record<T, HTMLButtonElement | null>>>({});

  function move(event: React.KeyboardEvent, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const id = tabs[next].id;
    onSelect(id);
    refs.current[id]?.focus();
  }

  // Keep the selected tab visible in the scrolling bar (not on first render: no page jump).
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    refs.current[selected]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

  return (
    <div
      role="tablist"
      aria-label="Sections du vélo"
      className={cn(
        "mt-5 mb-4 no-scrollbar flex gap-0.5 overflow-x-auto rounded-xl bg-surface-2 p-[3px]",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const isSelected = tab.id === selected;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${tab.id}`}
            aria-selected={isSelected}
            aria-controls={controls(tab.id)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => move(event, index)}
            // scroll-mt: clear of the sticky top bar when scrolled into view.
            className={cn(
              "h-[38px] flex-[1_0_auto] scroll-mt-[68px] rounded-[9px] px-3 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors pointer-coarse:h-11",
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

export function BikeTabList() {
  const { selected, select } = React.useContext(TabsContext)!;
  return (
    <>
      <TabBar
        tabs={TABS}
        selected={selected}
        onSelect={select}
        idPrefix="bike-tab"
        // "À prévoir" also shows the latest entries, placed in the other column from 1024 px.
        controls={(id) => (id === "plan" ? "bike-panel-plan bike-recent" : `bike-panel-${id}`)}
        className="lg:hidden"
      />
      <TabBar
        tabs={WIDE_TABS}
        selected={selected === "history" ? "history" : "overview"}
        // Back to the overview keeps nothing to choose: its sections all show.
        onSelect={(id) => {
          if (id === "history") select("history");
          else if (selected === "history") select("plan");
        }}
        idPrefix="bike-wide-tab"
        controls={(id) => (id === "history" ? "bike-panel-history" : "bike-overview")}
        className="w-fit max-lg:hidden [&>button]:px-5"
      />
    </>
  );
}

/** Hides what the selected tab does not show: one tab below 1024 px, overview or history above. */
function hiddenClasses(selected: BikeTabId, tab: BikeTabId) {
  return cn(
    selected !== tab && "max-lg:hidden",
    (tab === "history") !== (selected === "history") && "lg:hidden",
  );
}

/** The sections of one tab. From 1024 px, the overview's are shown together, in their columns. */
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
      className={cn("grid gap-[26px]", hiddenClasses(context.selected, tab), className)}
    >
      {children}
    </div>
  );
}

/** More content of a tab placed outside its panel (the latest entries, in the other column). */
export function BikeTabExtra({
  tab,
  id,
  children,
}: {
  tab: BikeTabId;
  id: string;
  children: React.ReactNode;
}) {
  const context = React.useContext(TabsContext)!;
  return (
    <div id={id} className={cn("grid gap-[26px]", hiddenClasses(context.selected, tab))}>
      {children}
    </div>
  );
}

/** The two columns of the overview (D-48), hidden from 1024 px while the history is shown. */
export function BikeOverview({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const context = React.useContext(TabsContext)!;
  return (
    <div
      id="bike-overview"
      className={cn(className, context.selected === "history" && "lg:hidden")}
    >
      {children}
    </div>
  );
}
