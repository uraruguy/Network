"use client";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Cloud, Fingerprint, KeyRound, LifeBuoy, ScanFace, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AuthScreen, StatusIcon } from "@/components/auth/AuthScreen";
import { RecoveryCodes } from "@/components/auth/RecoveryCodes";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "@/components/ui/Field";
import {
  describePasskeyError,
  enrollPasskey,
  fetchAuthenticationOptions,
  fetchRegistrationOptions,
  passkeyEnvironment,
  redeemRecoveryCode,
  verifyWithPasskey,
  type Biometric,
  type PasskeyEnvironment,
} from "@/lib/auth/mfa-client";
import { signOutEverywhere } from "@/lib/auth/signout";
import { normalizeRecoveryCodeInput } from "@/lib/security/recovery-code";

type Step = "verify" | "recovery" | "recovered" | "enroll" | "codes";

/** Request options older than this are refetched (the challenge cookie lives 5 minutes). */
const OPTIONS_MAX_AGE_MS = 4 * 60_000;

export function BiometricIcon({ biometric, size = 22 }: { biometric: Biometric; size?: number }) {
  if (biometric === "Face ID") return <ScanFace size={size} />;
  if (biometric === "Touch ID") return <Fingerprint size={size} />;
  return <KeyRound size={size} />;
}

/**
 * Second sign-in step. Owner with passkeys → one big "Continue with Face ID" button (explicit
 * tap; no auto-prompt) or a recovery code. No passkey yet → first-run enrollment, then the
 * recovery codes, shown once.
 */
export function VerifyFlow({ hasPasskeys, email, next, initialBiometric }: { hasPasskeys: boolean; email: string | null; next: string; initialBiometric: Biometric }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(hasPasskeys ? "verify" : "enroll");
  const [env, setEnv] = useState<PasskeyEnvironment | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [remaining, setRemaining] = useState(0);
  const options = useRef<{ value: PublicKeyCredentialRequestOptionsJSON | PublicKeyCredentialCreationOptionsJSON; at: number } | null>(null);

  const biometric = env?.biometric ?? initialBiometric;

  useEffect(() => {
    passkeyEnvironment().then(setEnv, () => {});
  }, []);

  // Fetch ceremony options ahead of the tap so Face ID opens immediately (Safari wants the
  // WebAuthn call close to the user gesture). Errors surface when the user taps.
  const prefetch = useCallback(async (kind: "verify" | "enroll") => {
    try {
      options.current = { value: kind === "verify" ? await fetchAuthenticationOptions() : await fetchRegistrationOptions(), at: Date.now() };
    } catch {
      options.current = null;
    }
  }, []);
  useEffect(() => {
    if (step === "verify" || step === "enroll") void prefetch(step);
  }, [step, prefetch]);

  /** The prefetched options if still fresh; each set is used for one attempt only. */
  const takeOptions = <T,>(): T | undefined => {
    const fresh = options.current && Date.now() - options.current.at < OPTIONS_MAX_AGE_MS ? (options.current.value as T) : undefined;
    options.current = null;
    return fresh;
  };

  /** Full navigation into the app: fresh document, static CSP, nothing from this page in memory. */
  const finish = () => window.location.replace(next);

  const go = (s: Step) => {
    setError(null);
    setStep(s);
  };

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      await verifyWithPasskey(takeOptions<PublicKeyCredentialRequestOptionsJSON>());
      finish(); // stay busy while the app loads
    } catch (err) {
      setError(describePasskeyError(err, biometric));
      setBusy(false);
      void prefetch("verify");
    }
  }

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const result = await enrollPasskey(env?.deviceName ?? "Passkey", takeOptions<PublicKeyCredentialCreationOptionsJSON>());
      if (result.recoveryCodes?.length) {
        setCodes(result.recoveryCodes);
        setStep("codes");
        setBusy(false);
      } else finish();
    } catch (err) {
      setError(describePasskeyError(err, biometric));
      setBusy(false);
      void prefetch("enroll");
    }
  }

  async function recover(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeRecoveryCodeInput(code);
    if (normalized.length !== 12) {
      setError("Recovery codes have 12 letters and numbers, like ABCD-EFGH-JKMN.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await redeemRecoveryCode(code);
      setRemaining(res.remaining);
      setStep("recovered");
    } catch (err) {
      setError(describePasskeyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    await signOutEverywhere(qc);
  }

  const footer = (
    <>
      {email && <span>Signed in as {email}</span>}
      <GlassButton variant="ghost" size="sm" onClick={signOut} loading={signingOut}>
        Use another account
      </GlassButton>
    </>
  );
  const errorText = error && (
    <p role="alert" className="rounded-sm bg-danger-soft px-3.5 py-2.5 text-center text-footnote text-danger">
      {error}
    </p>
  );

  if (step === "codes" && codes) {
    return (
      <AuthScreen
        icon={
          <StatusIcon tone="success">
            <ShieldCheck />
          </StatusIcon>
        }
        title="Save your recovery codes"
        subtitle={`If you ever can't use ${biometric === "passkey" ? "your passkey" : biometric}, each code lets you in once.`}
      >
        <RecoveryCodes codes={codes} onDone={finish} doneLabel="Continue to The Network" />
      </AuthScreen>
    );
  }

  if (step === "enroll") {
    const unsupported = env && !env.supported;
    return (
      <AuthScreen
        icon={
          <StatusIcon>
            <BiometricIcon biometric={biometric} />
          </StatusIcon>
        }
        title={biometric === "passkey" ? "Add a passkey" : `Set up ${biometric}`}
        subtitle="Your notes are private. After your password, The Network asks for a passkey — so a password alone is never enough."
        footer={footer}
      >
        <div className="space-y-4">
          <ul className="space-y-3 px-1">
            <Benefit icon={<BiometricIcon biometric={biometric} size={18} />}>
              {biometric === "passkey" ? "Unlock with your device or a security key." : `Unlock with ${biometric} — nothing to type.`}
            </Benefit>
            <Benefit icon={<Cloud size={18} />}>Syncs to your other Apple devices with iCloud Keychain.</Benefit>
            <Benefit icon={<LifeBuoy size={18} />}>Recovery codes cover you if you lose access.</Benefit>
          </ul>
          {unsupported && <p className="rounded-sm bg-warning-soft px-3.5 py-2.5 text-footnote text-fg-2">This browser can&apos;t create passkeys. Open The Network in Safari or Chrome.</p>}
          {errorText}
          <GlassButton variant="primary" size="lg" className="w-full" onClick={enroll} loading={busy} disabled={!!unsupported}>
            <BiometricIcon biometric={biometric} size={20} />
            {biometric === "passkey" ? "Create passkey" : `Set up ${biometric}`}
          </GlassButton>
        </div>
      </AuthScreen>
    );
  }

  if (step === "recovered") {
    return (
      <AuthScreen
        icon={
          <StatusIcon tone="success">
            <Check strokeWidth={2.6} />
          </StatusIcon>
        }
        title="You're in"
        subtitle={`That code is used up. ${remaining} recovery code${remaining === 1 ? "" : "s"} left.`}
      >
        <div className="space-y-4">
          <p className="px-1 text-subhead text-fg-2">
            Lost a device? Remove its passkey and add a new one in Settings → Security.
            {remaining <= 2 && " Generate new recovery codes there too."}
          </p>
          <GlassButton variant="primary" size="lg" className="w-full" onClick={finish}>
            Continue
          </GlassButton>
        </div>
      </AuthScreen>
    );
  }

  if (step === "recovery") {
    return (
      <AuthScreen
        icon={
          <StatusIcon>
            <LifeBuoy />
          </StatusIcon>
        }
        title="Use a recovery code"
        subtitle="Enter one of the codes you saved when you set up your passkey."
        footer={footer}
      >
        <form noValidate onSubmit={recover} className="space-y-4" method="post">
          {errorText}
          <Field label="Recovery code">
            <GlassInput
              name="recovery-code"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              className="font-mono tracking-wider"
            />
          </Field>
          <GlassButton type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
            Continue
          </GlassButton>
          <GlassButton variant="plain" className="w-full" onClick={() => go("verify")}>
            <ArrowLeft size={17} />
            Use {biometric === "passkey" ? "a passkey" : biometric} instead
          </GlassButton>
        </form>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Confirm it's you" subtitle={`Use ${biometric === "passkey" ? "your passkey" : biometric} to open The Network.`} footer={footer}>
      <div className="space-y-4">
        {errorText}
        <GlassButton variant="primary" size="lg" className="w-full" onClick={verify} loading={busy} autoFocus>
          <BiometricIcon biometric={biometric} size={20} />
          Continue with {biometric}
        </GlassButton>
        <GlassButton variant="plain" className="w-full" onClick={() => go("recovery")}>
          Use a recovery code
        </GlassButton>
      </div>
    </AuthScreen>
  );
}

function Benefit({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-subhead text-fg-2">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-xs bg-accent-soft text-accent-text" aria-hidden>
        {icon}
      </span>
      <span className="pt-1">{children}</span>
    </li>
  );
}
