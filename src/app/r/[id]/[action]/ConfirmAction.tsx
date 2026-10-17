"use client";
import { CalendarClock, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants, GlassButton } from "@/components/glass/GlassButton";
import { cn } from "@/lib/utils";

type Signed = { action: "done" | "snooze"; exp: number; sig: string };

const LABEL = { done: "Mark as done", snooze: "Snooze 1 week" } as const;
const RESULT = {
  done: (name: string) => ({ title: "Done", text: `${name} is off your list.` }),
  snooze: (name: string) => ({ title: "Snoozed", text: `${name} will be back in a week.` }),
} as const;

/**
 * The two buttons on the e-mail confirm page. Each is a real form posting the signed link, so it
 * also works without JavaScript; with JavaScript we stay on the page and show the result inline.
 */
export function ConfirmAction({ id, primary, secondary, name }: { id: string; primary: Signed; secondary: Signed; name: string }) {
  const [busy, setBusy] = useState<Signed["action"] | null>(null);
  const [done, setDone] = useState<Signed["action"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>, signed: Signed) {
    e.preventDefault();
    if (busy) return;
    setBusy(signed.action);
    setError(null);
    try {
      const res = await fetch(`/api/reminders/${id}/${signed.action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exp: signed.exp, sig: signed.sig }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Something went wrong. Try again.");
      setDone(signed.action);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "You seem to be offline. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    const r = RESULT[done](name);
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
        <div className="grid size-12 place-items-center rounded-full bg-success-soft text-success" aria-hidden>
          {done === "done" ? <Check size={24} strokeWidth={2.6} /> : <CalendarClock size={22} />}
        </div>
        <div>
          <p className="text-headline text-fg">{r.title}</p>
          <p className="mt-0.5 text-subhead text-fg-2">{r.text}</p>
        </div>
        <OpenAppLink className="mt-1" />
      </div>
    );
  }

  const form = (signed: Signed, variant: "primary" | "surface") => (
    <form key={signed.action} method="post" action={`/api/reminders/${id}/${signed.action}`} onSubmit={(e) => submit(e, signed)}>
      <input type="hidden" name="exp" value={signed.exp} />
      <input type="hidden" name="sig" value={signed.sig} />
      <GlassButton type="submit" variant={variant} size="lg" className="w-full" loading={busy === signed.action} disabled={!!busy && busy !== signed.action}>
        {signed.action === "done" ? <Check size={18} strokeWidth={2.6} /> : <CalendarClock size={18} />}
        {LABEL[signed.action]}
      </GlassButton>
    </form>
  );

  return (
    <div className="space-y-3">
      {form(primary, "primary")}
      {form(secondary, "surface")}
      {error && (
        <p role="alert" className="px-1 text-center text-footnote text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Quiet link into the app (sign-in required there). */
export function OpenAppLink({ className }: { className?: string }) {
  return (
    <Link href="/today" prefetch={false} className={cn(buttonVariants({ variant: "plain", size: "md" }), className)}>
      Open The Network
    </Link>
  );
}
