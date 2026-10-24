"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { FormField } from "./form-field";

function loginErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return "E-mail ou mot de passe incorrect.";
    case 403:
      return "Connexion refusée. Ouvrez l'application à l'adresse configurée dans PUBLIC_URL.";
    case 429:
      return "Trop de tentatives. Réessayez dans quelques secondes.";
    default:
      return "Connexion impossible pour le moment.";
  }
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.email({
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
    });
    if (signInError) {
      setError(loginErrorMessage(signInError.status));
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      {error ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FormField name="email" label="E-mail" type="email" autoComplete="username" required />
      <FormField
        name="password"
        label="Mot de passe"
        type="password"
        autoComplete="current-password"
        required
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
