import { HttpError } from "@/lib/api-server";
import { MissingSecretError } from "@/lib/crypto/keys";

/** Runs a connection write, mapping a missing APP_SECRET to a readable 422. */
export async function withSecretErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MissingSecretError) {
      throw new HttpError(422, "APP_SECRET is not set, so secrets can't be stored encrypted. Generate one with `openssl rand -base64 48` and add it to your environment.", "app_secret_missing");
    }
    throw err;
  }
}

export function managedByEnv(vars: string[]): never {
  throw new HttpError(409, `Managed by environment (${vars.join(", ")}). Remove these variables to configure it here.`, "managed_by_env");
}
