import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/session";
import { requireAccessContext } from "@/server/auth/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace } = await requireAccessContext();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="font-semibold tracking-tight">Bike-Book</span>
            <span className="truncate text-sm text-muted-foreground">{workspace.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}</span>
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm">
                Se déconnecter
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
