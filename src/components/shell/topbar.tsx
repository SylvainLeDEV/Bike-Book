"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "cn";
import { ChevronLeft, LogOut, Moon, Settings, Sun, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { nextThemePreference, THEME_LABELS, type ThemePreference } from "@/lib/theme";
import { Avatar } from "./nav";
import { useShell } from "./shell-context";

export const THEME_ICONS: Record<ThemePreference, typeof Sun> = {
  system: SunMoon,
  light: Sun,
  dark: Moon,
};

/** Cycles system → light → dark (D-31). The choice is kept per device in a cookie (D-52). */
export function ThemeToggle() {
  const { theme, setTheme } = useShell();
  const Icon = THEME_ICONS[theme];
  const next = nextThemePreference(theme);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${THEME_LABELS[theme]}. Passer au ${THEME_LABELS[next].toLowerCase()}`}
      onClick={() => setTheme(next)}
    >
      <Icon />
    </Button>
  );
}

/** Account and settings, from the avatar (D-30). */
export function AccountMenu() {
  const { user, onSignOut, onOpenSettings } = useShell();
  const [, startTransition] = React.useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Mon compte">
          <Avatar name={user.name} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block text-sm font-semibold">{user.name}</span>
          <span className="block text-[12.5px] text-fg-muted">{user.workspaceName}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenSettings}>
          <Settings aria-hidden />
          Réglages
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => startTransition(async () => onSignOut())}>
          <LogOut aria-hidden />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "‹ Vélos / Spectral": the way back, then where you are. */
export function Crumb({
  back,
  current,
}: {
  back: { href?: string; onClick?: () => void; label: string };
  current: string;
}) {
  const className =
    "-ml-2 inline-flex h-10 items-center gap-0.5 rounded-control pr-2 pl-1 font-medium text-brand-ink hover:bg-surface-2 pointer-coarse:h-11 [&_svg]:size-[18px]";
  const content = (
    <>
      <ChevronLeft aria-hidden />
      {back.label}
    </>
  );
  return (
    <div className="flex min-w-0 items-center gap-1 text-[15px]">
      {back.href ? (
        <Link href={back.href} className={className}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={back.onClick} className={className}>
          {content}
        </button>
      )}
      <span className="hidden text-fg-muted md:inline" aria-hidden>
        /
      </span>
      <span className="truncate font-semibold" aria-current="page">
        {current}
      </span>
    </div>
  );
}

/**
 * Top bar of a page: the workspace name or a crumb on the left, the page's own action (edit),
 * the theme and the account on the right. Sticky while the page scrolls.
 */
export function Topbar({ start, actions }: { start?: React.ReactNode; actions?: React.ReactNode }) {
  const { user } = useShell();
  return (
    <header className="sticky top-0 z-20 flex h-14 min-w-0 shrink-0 items-center gap-1.5 border-b border-border bg-surface pr-2.5 pl-4 md:pr-4 md:pl-6">
      <div className="flex min-w-0 items-center gap-1">
        {start ?? <span className="text-[15px] font-semibold">{user.workspaceName}</span>}
      </div>
      <div className="ml-auto flex items-center gap-1">
        {actions}
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}

/** The content column of a page, with the mockup's margins (16, 24, 32 px). */
export function PageBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1120px] px-4 pt-4 pb-7 md:px-6 md:pt-6 md:pb-9 lg:px-8 lg:pt-7 lg:pb-10",
        className,
      )}
      {...props}
    />
  );
}
