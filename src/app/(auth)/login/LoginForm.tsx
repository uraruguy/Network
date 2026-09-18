"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { Field, GlassInput } from "@/components/glass/GlassInput";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "Sign-in link was invalid or expired." : null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = supabaseBrowser();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(params.get("next") ?? "/today");
          router.refresh();
        } else {
          setInfo("Check your inbox to confirm your email, then sign in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(params.get("next") ?? "/today");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard strong className="p-6">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <GlassInput
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password">
          <GlassInput
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        {error && <p className="text-[13px] text-danger px-1">{error}</p>}
        {info && <p className="text-[13px] text-success px-1">{info}</p>}
        <GlassButton type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? "…" : mode === "signup" ? "Create my Network" : "Sign in"}
        </GlassButton>
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="block w-full text-center text-[13px] text-fg-3 hover:text-fg-2"
        >
          {mode === "signup" ? "Already set up? Sign in" : "First time here? Create your account"}
        </button>
      </form>
    </GlassCard>
  );
}
