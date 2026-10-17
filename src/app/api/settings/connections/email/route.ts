import { z } from "zod";
import { HttpError, parseBody, withOwner } from "@/lib/api-server";
import { getEmailConnectionView, saveEmailConnection, UI_EMAIL_PROVIDERS } from "@/lib/connections/email";
import { managedByEnv, withSecretErrors } from "../../_lib/errors";

/** "Name <a@b.c>" or "a@b.c". */
const fromAddress = z
  .string()
  .trim()
  .max(200)
  .refine((v) => !v || /^(?:[^<>@\r\n]*<\s*[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\s*>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/.test(v), "Use an address like “The Network <hello@example.com>”")
  .nullish();

const body = z.object({
  provider: z.enum(UI_EMAIL_PROVIDERS),
  from: fromAddress,
  /** Resend key — write-only. Omit to keep, "" to clear. */
  apiKey: z.string().trim().max(500).nullish(),
  smtp: z
    .object({
      host: z.string().trim().max(255).regex(/^[\w.-]*$/, "Host name only, e.g. smtp.example.com").nullish(),
      port: z.number().int().min(1).max(65535).nullish(),
      secure: z.boolean().optional(),
      user: z.string().trim().max(255).nullish(),
      /** Write-only. Omit to keep, "" to clear. */
      pass: z.string().max(500).nullish(),
    })
    .optional(),
});

/** → EmailConnectionView (secrets never leave the server). */
export const GET = withOwner(async ({ ownerId }) => getEmailConnectionView(ownerId));

/** Save the e-mail connection (409 when the environment manages it) → EmailConnectionView. */
export const PUT = withOwner(async ({ ownerId, req }) => {
  const input = await parseBody(req, body);
  const current = await getEmailConnectionView(ownerId);
  if (current.source === "env") managedByEnv(current.envVars);
  if (input.provider === "resend") {
    const keepsKey = input.apiKey === undefined && current.storedProvider === "resend" && current.resend.hasSecret;
    if (!input.apiKey && !keepsKey) throw new HttpError(422, "Add your Resend API key.", "api_key_required");
  }
  if (input.provider === "smtp" && !input.smtp?.host) throw new HttpError(422, "Add the SMTP server's host name.", "smtp_host_required");
  await withSecretErrors(() =>
    saveEmailConnection(ownerId, {
      ...input,
      apiKey: input.apiKey === null ? "" : input.apiKey,
      smtp: input.smtp ? { ...input.smtp, pass: input.smtp.pass === null ? "" : input.smtp.pass } : undefined,
    }),
  );
  return getEmailConnectionView(ownerId);
});
