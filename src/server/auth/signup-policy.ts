/**
 * Who may create an account (D-27): anyone while no account exists yet (first-launch setup
 * screen), then only when self sign-up is switched on with ALLOW_SIGNUP.
 */
export function canCreateAccount(input: { existingUsers: number; allowSignup: boolean }) {
  return input.existingUsers === 0 || input.allowSignup;
}

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
