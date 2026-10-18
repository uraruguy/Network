"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Fingerprint, KeyRound, ScanFace } from "lucide-react";
import { useEffect, useState } from "react";
import { RecoveryCodes } from "@/components/auth/RecoveryCodes";
import { GlassButton } from "@/components/glass/GlassButton";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { describePasskeyError, enrollPasskey, isPasskeyCancel, passkeyEnvironment, securityKeys, useSecurityOverview, type PasskeyEnvironment } from "@/lib/auth/mfa-client";

const SNOOZE_KEY = "network:passkey-prompt-snoozed-until";
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

function snoozedUntil(): number {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Gentle "Sign in faster with Face ID" offer, mounted once in the app shell. Only for deployments
 * that opted out of the required passkey step (AUTH_REQUIRE_PASSKEY=false) and only while the
 * owner has no passkey; with the default (required) setup, enrollment happens at sign-in and
 * this renders nothing. "Not now" snoozes it for 30 days on this device.
 */
export function PasskeyPrompt() {
  const qc = useQueryClient();
  const { data } = useSecurityOverview();
  const [env, setEnv] = useState<PasskeyEnvironment | null>(null);
  const [snoozed, setSnoozed] = useState(true); // until read on mount (no localStorage on the server)
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const eligible = !!data && !data.passkeyRequired && data.passkeys.length === 0;

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    passkeyEnvironment().then(
      (e) => {
        if (cancelled) return;
        setEnv(e);
        setSnoozed(snoozedUntil() > Date.now());
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [eligible]);

  if (!eligible && !codes) return null;
  const open = !!codes || (!!env?.supported && !snoozed);
  const biometric = env?.biometric ?? "passkey";
  const Icon = biometric === "Face ID" ? ScanFace : biometric === "Touch ID" ? Fingerprint : KeyRound;

  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
    setSnoozed(true);
  };

  async function enable() {
    setBusy(true);
    try {
      const result = await enrollPasskey(env?.deviceName ?? "Passkey");
      if (result.recoveryCodes?.length) setCodes(result.recoveryCodes);
      else toast.success(`${biometric === "passkey" ? "Passkey" : biometric} is on`);
      await qc.invalidateQueries({ queryKey: securityKeys.overview });
    } catch (err) {
      if (!isPasskeyCancel(err)) toast.error("Couldn't set it up", { description: describePasskeyError(err, biometric) });
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <Sheet open={open} onOpenChange={() => {}} title="Save your recovery codes" description="Each code lets you in once if you can't use your passkey." dismissible={false} hideClose>
        <RecoveryCodes
          codes={codes}
          doneLabel="Done"
          onDone={() => {
            setCodes(null);
            toast.success(`${biometric === "passkey" ? "Passkey" : biometric} is on`);
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && snooze()} hideClose>
      <div className="flex flex-col items-center gap-4 pt-2 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent-text" aria-hidden>
          <Icon size={30} />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-title3 text-fg">Sign in faster with {biometric === "passkey" ? "a passkey" : biometric}</h2>
          <p className="mx-auto max-w-[36ch] text-subhead text-balance text-fg-2">
            Add it as a second step after your password, so a leaked password alone can&apos;t open your notes.
          </p>
        </div>
        <div className="w-full space-y-2 pt-1">
          <GlassButton variant="primary" size="lg" className="w-full" onClick={enable} loading={busy}>
            Enable {biometric === "passkey" ? "passkey" : biometric}
          </GlassButton>
          <GlassButton variant="plain" className="w-full" onClick={snooze} disabled={busy}>
            Not now
          </GlassButton>
        </div>
      </div>
    </Sheet>
  );
}
