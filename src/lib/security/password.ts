/**
 * Password policy for the owner account (sign-in reset + Settings → Change password).
 * Shared by the client forms and the server route, so the rule lives in one place.
 *
 * Long beats clever: at least 12 characters with at least one letter and one digit. The real
 * protection is the passkey second factor; this keeps the first factor out of guessing range.
 * (A password manager — iCloud Keychain — generates far stronger ones than this minimum.)
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Returns a human message describing what's missing, or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) return "Mix letters and numbers.";
  return null;
}
