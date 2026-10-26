import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAccessContext } from "@/server/auth/context";
import { getWorkspaceOverview } from "@/server/db";

export const metadata: Metadata = { title: "Tableau de bord · Bike-Book" };

export default async function DashboardPage() {
  const context = await requireAccessContext();
  const workspace = getWorkspaceOverview(context);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Bonjour {context.user.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{workspace?.name ?? context.workspace.name}</CardTitle>
          <CardDescription>
            Ton garage est prêt. Les vélos, les sorties et l&apos;entretien arrivent dans la
            prochaine version.
          </CardDescription>
        </CardHeader>
        {workspace ? (
          <CardContent className="text-sm text-muted-foreground">
            {workspace.memberCount} membre{workspace.memberCount > 1 ? "s" : ""} · créé le{" "}
            {workspace.createdAt.toLocaleDateString("fr-FR", { dateStyle: "long" })}
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
