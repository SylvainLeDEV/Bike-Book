import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/server/auth/context";
import { countUsers } from "@/server/db";
import { getEnv } from "@/server/env";

export const metadata: Metadata = { title: "Connexion · Bike-Book" };

export default async function LoginPage() {
  await connection();
  if (countUsers() === 0) redirect("/setup");
  if (await getSession()) redirect("/");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>Accède à ton garage.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
      {getEnv().allowSignup ? (
        <CardFooter className="justify-center text-sm text-muted-foreground">
          Pas encore de compte ?&nbsp;
          <Link href="/setup" className="underline underline-offset-4">
            Créer un compte
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}
