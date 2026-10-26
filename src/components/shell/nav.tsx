"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Activity, Bike, House, Plus, Settings, Warehouse, type LucideIcon } from "lucide-react";
import { initialsOf } from "@/lib/display";
import { useQuickRide } from "@/components/rides/quick-ride";
import { Button } from "@/components/ui/button";
import { useShell, type ShellNav } from "./shell-context";

type NavEntry = { key: keyof ShellNav; label: string; icon: LucideIcon; exact?: boolean };

const ENTRIES: NavEntry[] = [
  { key: "home", label: "Accueil", icon: House, exact: true },
  { key: "bikes", label: "Vélos", icon: Bike },
  { key: "activity", label: "Activité", icon: Activity },
  { key: "workshop", label: "Atelier", icon: Warehouse },
];

function useIsCurrent() {
  const pathname = usePathname();
  return (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** The brand mark: the bike line in a turquoise square. */
export function BrandMark() {
  return (
    <span className="grid size-[38px] shrink-0 place-items-center rounded-[11px] bg-brand text-brand-fg">
      <Bike className="size-[22px] stroke-[2.2]" aria-hidden />
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[34px] shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xs leading-none font-semibold text-fg",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * From 700 px: an icon rail (labels read by screen readers only); from 1024 px: the full
 * sidebar with its labels (D-30).
 */
export function Sidebar() {
  const { nav, user, onOpenSettings } = useShell();
  const isCurrent = useIsCurrent();
  const { open: openQuickRide } = useQuickRide();
  const item =
    "flex h-11 w-12 items-center justify-center gap-3 rounded-control text-[14.5px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg lg:w-full lg:justify-start lg:px-3 [&_svg]:size-[18px]";

  return (
    <nav
      aria-label="Navigation principale"
      className="sticky top-0 hidden h-dvh flex-col items-center gap-1 overflow-y-auto border-r border-border bg-surface px-2.5 py-3.5 md:flex lg:items-stretch lg:px-3.5 lg:py-[18px]"
    >
      <div className="flex items-center gap-2.5 pb-3.5 lg:px-1.5 lg:pb-4">
        <BrandMark />
        <span className="sr-only num text-[21px] leading-none font-bold tracking-[0.01em] lg:not-sr-only">
          Bike-Book
        </span>
      </div>
      <Button className="mb-3 w-12 px-0 lg:w-full lg:px-4" onClick={() => openQuickRide()}>
        <Plus />
        <span className="sr-only lg:not-sr-only">Ajouter une sortie</span>
      </Button>
      <ul className="m-0 grid w-full list-none justify-items-center gap-0.5 p-0 lg:justify-items-stretch">
        {ENTRIES.map(({ key, label, icon: Icon, exact }) => {
          const current = isCurrent(nav[key], exact);
          return (
            <li key={key}>
              <Link
                href={nav[key]}
                aria-current={current ? "page" : undefined}
                className={cn(
                  item,
                  current &&
                    "bg-brand-soft font-semibold text-brand-ink hover:bg-brand-soft hover:text-brand-ink",
                )}
              >
                <Icon aria-hidden />
                <span className="sr-only lg:not-sr-only">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto grid w-full justify-items-center gap-0.5 border-t border-border pt-3 lg:justify-items-stretch">
        <button type="button" className={item} onClick={onOpenSettings}>
          <Settings aria-hidden />
          <span className="sr-only lg:not-sr-only">Réglages</span>
        </button>
        <div className="flex min-w-0 items-center gap-2.5 pt-2 pb-0.5 lg:px-1">
          <Avatar name={user.name} />
          <span className="sr-only min-w-0 lg:not-sr-only">
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block truncate text-[12.5px] text-fg-muted">{user.workspaceName}</span>
          </span>
        </div>
      </div>
    </nav>
  );
}

/** Under 700 px: the bottom tab bar with the central "+" for the quick ride entry. */
export function BottomNav() {
  const { nav } = useShell();
  const isCurrent = useIsCurrent();
  const { open: openQuickRide } = useQuickRide();
  const entry = (index: number) => {
    const { key, label, icon: Icon, exact } = ENTRIES[index];
    const current = isCurrent(nav[key], exact);
    return (
      <Link
        href={nav[key]}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] leading-none font-medium text-fg-muted [&_svg]:size-[22px]",
          current && "font-semibold text-brand-ink [&_svg]:stroke-[2.5]",
        )}
      >
        <Icon aria-hidden />
        <span>{label}</span>
      </Link>
    );
  };
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end border-t border-border bg-surface px-1.5 pt-1 pb-[max(8px,env(safe-area-inset-bottom))] md:hidden"
    >
      {entry(0)}
      {entry(1)}
      <button
        type="button"
        aria-label="Ajouter une sortie"
        onClick={() => openQuickRide()}
        className="-mt-[26px] grid size-14 place-items-center self-center justify-self-center rounded-[18px] bg-brand text-brand-fg shadow-(--shadow-md) transition-[transform,background-color] hover:bg-brand-hover active:scale-[0.94]"
      >
        <Plus className="size-[26px] stroke-[2.5]" aria-hidden />
      </button>
      {entry(2)}
      {entry(3)}
    </nav>
  );
}
