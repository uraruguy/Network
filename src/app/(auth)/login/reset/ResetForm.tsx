"use client";
import { Check, KeyRound } from "lucide-react";
import { useState } from "react";
import { AuthScreen, StatusIcon } from "@/components/auth/AuthScreen";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "@/components/ui/Field";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/security/password";
import { supabaseBrowser } from "@/lib/supabase/client";

type Errors = { password?: string; confirm?: string; form?: string };

function describeUpdateError(err: { code?: string; status?: number; message?: string }): string {
  if (err.code === "same_password") return "Choose a password you haven't used here before.";
  if (err.code === "weak_password") return "That password is too easy to guess. Try a longer one.";
  if (err.status === 401 || err.code === "session_not_found") return "This reset link has expired. Request a new one from the sign-in page.";
  if (err.message?.toLowerCase().includes("fetch")) return "You seem to be offline. Check your connection and try again.";
  return "Couldn't update your password. Try again.";
}

/**
 * New-password form for the recovery session. A hidden username field tells iCloud Keychain
 * which account the generated password belongs to. Other sessions are signed out afterwards.
 */
export function ResetForm({ email }: { email: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    const problem = passwordProblem(password);
    if (problem) found.password = problem;
    else if (confirm !== password) found.confirm = "The passwords don't match.";
    setErrors(found);
    if (found.password || found.confirm) return;

    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrors({ form: describeUpdateError(error) });
        return;
      }
      // Whoever triggered the reset shouldn't keep a session elsewhere.
      await supabase.auth.signOut({ scope: "others" }).catch(() => {});
      setDone(true);
    } catch (err) {
      setErrors({ form: describeUpdateError(err as Error) });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthScreen
        icon={
          <StatusIcon tone="success">
            <Check strokeWidth={2.6} />
          </StatusIcon>
        }
        title="Password updated"
        subtitle="Other devices were signed out. Confirm with your passkey to continue."
      >
        <GlassButton variant="primary" size="lg" className="w-full" onClick={() => window.location.replace("/login/verify")}>
          Continue
        </GlassButton>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      icon={
        <StatusIcon>
          <KeyRound />
        </StatusIcon>
      }
      title="Choose a new password"
      subtitle={`At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers. Let iCloud Keychain suggest one.`}
    >
      <form noValidate onSubmit={submit} className="space-y-4" method="post">
        {errors.form && (
          <p role="alert" className="rounded-sm bg-danger-soft px-3.5 py-2.5 text-footnote text-danger">
            {errors.form}
          </p>
        )}
        {email && <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />}
        <Field label="New password" error={errors.password}>
          <GlassInput type="password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          <GlassInput type="password" name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <GlassButton type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Update password
        </GlassButton>
      </form>
    </AuthScreen>
  );
}
