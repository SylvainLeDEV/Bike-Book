"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createAccountAction, type CreateAccountState } from "@/server/actions/account";
import { FormField } from "./form-field";

const initialState: CreateAccountState = {};

export function CreateAccountForm({ minPasswordLength }: { minPasswordLength: number }) {
  const [state, formAction, pending] = useActionState(createAccountAction, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4">
      {state.error ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <FormField
        name="name"
        label="Ton nom"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        error={errors.name}
      />
      <FormField
        name="email"
        label="E-mail"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        error={errors.email}
      />
      <FormField
        name="password"
        label="Mot de passe"
        type="password"
        autoComplete="new-password"
        minLength={minPasswordLength}
        required
        hint={`${minPasswordLength} caractères au minimum.`}
        error={errors.password}
      />
      <FormField
        name="passwordConfirmation"
        label="Confirmer le mot de passe"
        type="password"
        autoComplete="new-password"
        required
        error={errors.passwordConfirmation}
      />
      <FormField
        name="workspaceName"
        label="Nom de ton garage"
        required
        defaultValue={state.values?.workspaceName ?? "Mon garage"}
        hint="L'espace qui regroupe tes vélos."
        error={errors.workspaceName}
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Création…" : "Créer mon compte"}
      </Button>
    </form>
  );
}
