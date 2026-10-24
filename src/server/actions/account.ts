"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth } from "@/server/auth/auth";
import {
  canCreateAccount,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/server/auth/signup-policy";
import { countUsers, createWorkspaceWithOwner } from "@/server/db";
import { getEnv } from "@/server/env";

const createAccountSchema = z
  .object({
    name: z.string().trim().min(1, "Indiquez votre nom.").max(100, "100 caractères au maximum."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: "Adresse e-mail invalide." })),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `${MIN_PASSWORD_LENGTH} caractères au minimum.`)
      .max(MAX_PASSWORD_LENGTH, `${MAX_PASSWORD_LENGTH} caractères au maximum.`),
    passwordConfirmation: z.string(),
    workspaceName: z
      .string()
      .trim()
      .min(1, "Donnez un nom à votre garage.")
      .max(100, "100 caractères au maximum."),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    path: ["passwordConfirmation"],
    error: "Les mots de passe ne correspondent pas.",
  });

type Field = keyof z.input<typeof createAccountSchema>;

export type CreateAccountState = {
  error?: string;
  fieldErrors?: Partial<Record<Field, string>>;
  /** Submitted values to refill the form (never the passwords). */
  values?: { name: string; email: string; workspaceName: string };
};

const SIGN_UP_ERRORS: Record<string, string> = {
  USER_ALREADY_EXISTS: "Un compte existe déjà avec cette adresse e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec cette adresse e-mail.",
  PASSWORD_TOO_SHORT: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`,
  PASSWORD_TOO_LONG: `Le mot de passe doit faire au plus ${MAX_PASSWORD_LENGTH} caractères.`,
  SIGN_UP_DISABLED: "La création de compte est désactivée.",
  INVALID_ORIGIN: "Origine refusée : ouvrez l'application à l'adresse configurée dans PUBLIC_URL.",
};

/**
 * First-launch setup (and self sign-up when ALLOW_SIGNUP is on): creates the user, their
 * workspace and their owner membership, then signs them in.
 */
export async function createAccountAction(
  _previous: CreateAccountState,
  formData: FormData,
): Promise<CreateAccountState> {
  const raw = Object.fromEntries(
    (["name", "email", "password", "passwordConfirmation", "workspaceName"] as const).map((key) => [
      key,
      String(formData.get(key) ?? ""),
    ]),
  ) as Record<Field, string>;
  const values = { name: raw.name, email: raw.email, workspaceName: raw.workspaceName };

  if (!canCreateAccount({ existingUsers: countUsers(), allowSignup: getEnv().allowSignup })) {
    redirect("/login");
  }

  const parsed = createAccountSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: CreateAccountState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as Field;
      fieldErrors[field] ??= issue.message;
    }
    return { fieldErrors, values };
  }
  const input = parsed.data;

  let userId: string;
  try {
    const result = await getAuth().api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
      headers: await headers(),
    });
    userId = result.user.id;
  } catch (error) {
    if (isAPIError(error)) {
      const code = typeof error.body?.code === "string" ? error.body.code : "";
      return { error: SIGN_UP_ERRORS[code] ?? "Impossible de créer le compte.", values };
    }
    throw error;
  }

  createWorkspaceWithOwner({ userId, workspaceName: input.workspaceName });
  redirect("/");
}
