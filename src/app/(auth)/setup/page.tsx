import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CreateAccountForm } from "@/components/auth/create-account-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/server/auth/context";
import { canCreateAccount, MIN_PASSWORD_LENGTH } from "@/server/auth/signup-policy";
import { countUsers } from "@/server/db";
import { getEnv } from "@/server/env";

export const metadata: Metadata = { title: "Créer un compte · Bike-Book" };

/** First-launch setup screen; also the sign-up page when ALLOW_SIGNUP is on. */
export default async function SetupPage() {
  await connection();
  const existingUsers = countUsers();
  if (!canCreateAccount({ existingUsers, allowSignup: getEnv().allowSignup })) {
    redirect("/login");
  }
  if (await getSession()) redirect("/");
  const firstLaunch = existingUsers === 0;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{firstLaunch ? "Bienvenue sur Bike-Book" : "Créer un compte"}</CardTitle>
        <CardDescription>
          {firstLaunch
            ? "Crée ton compte et ton garage. Cet écran n'apparaît qu'au premier lancement."
            : "Crée ton compte et ton garage."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CreateAccountForm minPasswordLength={MIN_PASSWORD_LENGTH} />
      </CardContent>
      {firstLaunch ? null : (
        <CardFooter className="justify-center text-sm text-muted-foreground">
          Déjà un compte ?&nbsp;
          <Link href="/login" className="underline underline-offset-4">
            Se connecter
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}
