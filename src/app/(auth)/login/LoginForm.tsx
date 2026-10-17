"use client";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "@/components/ui/Field";
import { safeNext } from "@/lib/auth/redirect";
import { supabaseBrowser } from "@/lib/supabase/client";

type Errors = { email?: string; password?: string; form?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Maps Supabase Auth errors to calm copy. Never reveals whether an account exists. */
function describeAuthError(err: { code?: string; status?: number; message?: string } | null): string {
  if (!err) return "Something went wrong. Try again.";
  if (err.code === "invalid_credentials" || err.message === "Invalid login credentials") return "That email and password don't match.";
  if (err.code === "over_request_rate_limit" || err.code === "over_email_send_rate_limit" || err.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (err.code === "email_not_confirmed") return "This account isn't confirmed yet.";
  if (err.message?.toLowerCase().includes("fetch")) return "You seem to be offline. Check your connection and try again.";
  return "Couldn't sign in. Try again.";
}

/**
 * Email + password (step 1 of 2). Field names and autocomplete hints let iCloud Keychain fill
 * and save the credentials. On success we navigate (full page load) to the passkey step; the
 * proxy skips it when the deployment doesn't require one.
 */
export function LoginForm({ next, notice, startInReset = false }: { next: string | null; notice: string | null; startInReset?: boolean }) {
  const [mode, setMode] = useState<"signin" | "reset" | "sent">(startInReset ? "reset" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>(notice ? { form: notice } : {});
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    if (!EMAIL.test(email.trim())) found.email = email.trim() ? "Enter a valid email address." : "Enter your email.";
    if (!password) found.password = "Enter your password.";
    setErrors(found);
    if (found.email || found.password) return;

    setBusy(true);
    try {
      const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setErrors({ form: describeAuthError(error) });
        setBusy(false);
        return;
      }
      const target = safeNext(next, window.location.origin);
      window.location.replace(`/login/verify?next=${encodeURIComponent(target)}`);
    } catch (err) {
      setErrors({ form: describeAuthError(err as Error) });
      setBusy(false);
    }
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setErrors({ email: email.trim() ? "Enter a valid email address." : "Enter your email." });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/login/reset")}`,
      });
      // Same answer whether or not the address has an account; only surface throttling/offline.
      if (error && (error.status === 429 || error.message?.toLowerCase().includes("fetch"))) setErrors({ form: describeAuthError(error) });
      else setMode("sent");
    } catch (err) {
      setErrors({ form: describeAuthError(err as Error) });
    } finally {
      setBusy(false);
    }
  }

  const emailField = (
    <Field label="Email" error={errors.email}>
      <GlassInput
        type="email"
        name="email"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
    </Field>
  );

  const formError = errors.form && (
    <p role="alert" className="rounded-sm bg-danger-soft px-3.5 py-2.5 text-footnote text-danger">
      {errors.form}
    </p>
  );

  if (mode === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
        <div className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent-text" aria-hidden>
          <MailCheck size={22} />
        </div>
        <div className="space-y-1">
          <p className="text-headline text-fg">Check your email</p>
          <p className="text-subhead text-balance text-fg-2">If {email.trim()} has an account, a link to choose a new password is on its way. Open it on this device.</p>
        </div>
        <GlassButton variant="plain" onClick={() => setMode("signin")}>
          Back to sign in
        </GlassButton>
      </div>
    );
  }

  if (mode === "reset") {
    return (
      <form noValidate onSubmit={sendReset} className="space-y-4" method="post">
        <div className="space-y-1 px-1">
          <p className="text-headline text-fg">Reset your password</p>
          <p className="text-subhead text-fg-2">We&apos;ll email you a link to choose a new one. You&apos;ll still confirm with your passkey afterwards.</p>
        </div>
        {formError}
        {emailField}
        <GlassButton type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Send reset link
        </GlassButton>
        <GlassButton
          variant="plain"
          className="w-full"
          onClick={() => {
            setErrors({});
            setMode("signin");
          }}
        >
          <ArrowLeft size={17} />
          Back to sign in
        </GlassButton>
      </form>
    );
  }

  return (
    // method="post": if scripts ever fail to load, a native submit must never put the password in the URL.
    <form noValidate onSubmit={signIn} className="space-y-4" method="post">
      {formError}
      {emailField}
      <Field label="Password" error={errors.password}>
        <GlassInput type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
      </Field>
      <GlassButton type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
        Sign in
      </GlassButton>
      <GlassButton
        variant="plain"
        className="w-full"
        onClick={() => {
          setErrors({});
          setMode("reset");
        }}
      >
        Forgot password?
      </GlassButton>
    </form>
  );
}
