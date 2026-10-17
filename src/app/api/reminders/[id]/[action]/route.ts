import { NextResponse } from "next/server";
import { applyLinkAction, isSettled, loadLinkedReminder, verifyReminderLink } from "@/app/r/_lib/reminder-link";

/**
 * Digest e-mail actions. Authorization is the HMAC signature (no session).
 *
 *   POST  { exp, sig }  (JSON, or a form post from the confirm page without JavaScript)
 *         → re-verifies the signature, then completes / snoozes the reminder. Idempotent.
 *   GET   never mutates (link scanners prefetch). Links from older e-mails pointed here: they're
 *         forwarded to the confirm page at /r/<id>/<action> with their signature intact.
 */

type Ctx = { params: Promise<{ id: string; action: string }> };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request, ctx: Ctx) {
  const { id, action } = await ctx.params;
  const isForm = (req.headers.get("content-type") ?? "").startsWith("application/x-www-form-urlencoded");
  let exp: unknown;
  let sig: unknown;
  try {
    if (isForm) {
      const form = await req.formData();
      exp = form.get("exp");
      sig = form.get("sig");
    } else {
      ({ exp, sig } = ((await req.json()) ?? {}) as { exp?: unknown; sig?: unknown });
    }
  } catch {
    return json({ error: "bad_request", message: "Invalid body" }, 400);
  }

  if (!verifyReminderLink(id, action, exp, sig)) return json({ error: "invalid_link", message: "This link is invalid or has expired." }, 403);
  const reminder = await loadLinkedReminder(id);
  if (!reminder) return json({ error: "not_found", message: "This follow-up no longer exists." }, 404);

  const already = isSettled(reminder);
  if (!already) await applyLinkAction(reminder, action);

  if (isForm) {
    // Back to the confirm page, which now shows the settled state.
    return seeOther(`/r/${id}/${action}`, { exp: String(exp), sig: String(sig) });
  }
  return json({ ok: true, action, already });
}

export async function GET(req: Request, ctx: Ctx) {
  const { id, action } = await ctx.params;
  const url = new URL(req.url);
  const keep = Object.fromEntries(["exp", "sig"].flatMap((k) => (url.searchParams.get(k) ? [[k, url.searchParams.get(k)!]] : [])));
  return seeOther(`/r/${encodeURIComponent(id)}/${encodeURIComponent(action)}`, keep);
}

/** 303 with a relative Location: stays on whatever host the browser used (no Host-header trust). */
function seeOther(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new Response(null, { status: 303, headers: { location: qs ? `${path}?${qs}` : path, "cache-control": "no-store" } });
}
