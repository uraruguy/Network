"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Cloud, KeyRound, LifeBuoy, LockKeyhole, LogOut, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { RecoveryCodes } from "@/components/auth/RecoveryCodes";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { confirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { Menu } from "@/components/ui/Menu";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Sheet } from "@/components/ui/Sheet";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import {
  describePasskeyError,
  enrollPasskey,
  isPasskeyCancel,
  passkeyEnvironment,
  securityKeys,
  useSecurityOverview,
  verifyWithPasskey,
  type PasskeyEnvironment,
} from "@/lib/auth/mfa-client";
import { formatDate } from "@/lib/format";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/security/password";
import type { PasskeyInfo, SecurityOverview } from "@/lib/security/types";
import { supabaseBrowser } from "@/lib/supabase/client";

const passkeyLabel = (p: PasskeyInfo) => p.name ?? "Passkey";

/**
 * Settings → Security: passkeys (add, rename, remove), recovery codes, password, other sessions.
 * Changes that touch the second factor need a passkey-verified session; when this session only
 * has a password (deployments that don't require passkeys), we ask for the passkey first.
 */
export function SecuritySection() {
  const qc = useQueryClient();
  const { data, isPending, isError, refetch } = useSecurityOverview();
  const [env, setEnv] = useState<PasskeyEnvironment | null>(null);
  const [adding, setAdding] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [renaming, setRenaming] = useState<PasskeyInfo | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    passkeyEnvironment().then(setEnv, () => {});
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: securityKeys.overview });
  const biometric = env?.biometric ?? "passkey";

  /** Proves an existing passkey first when this session only has a password. */
  async function ensureVerified(overview: SecurityOverview) {
    if (overview.mfaVerified || overview.passkeys.length === 0) return;
    await verifyWithPasskey();
    await refresh();
  }

  async function addPasskey() {
    if (!data) return;
    setAdding(true);
    try {
      await ensureVerified(data);
      const result = await enrollPasskey(env?.deviceName ?? "Passkey");
      toast.success("Passkey added", { description: passkeyLabel(result.credential) });
      if (result.recoveryCodes?.length) setCodes(result.recoveryCodes);
      await refresh();
    } catch (err) {
      if (!isPasskeyCancel(err)) toast.error("Couldn't add the passkey", { description: describePasskeyError(err, biometric) });
    } finally {
      setAdding(false);
    }
  }

  async function removePasskey(p: PasskeyInfo) {
    if (!data) return;
    const ok = await confirm({
      title: `Remove “${passkeyLabel(p)}”?`,
      message: "It will no longer unlock The Network. Devices that sync it will lose it here too.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await ensureVerified(data);
      await api.delete(`/api/security/passkeys/${encodeURIComponent(p.id)}`);
      toast("Passkey removed");
      await refresh();
    } catch (err) {
      if (!isPasskeyCancel(err)) toast.error("Couldn't remove the passkey", { description: describePasskeyError(err) });
    }
  }

  async function regenerateCodes() {
    if (!data) return;
    const ok = await confirm({
      title: "Generate new recovery codes?",
      message: "Your current codes stop working right away.",
      confirmLabel: "Generate",
    });
    if (!ok) return;
    try {
      await ensureVerified(data);
      const res = await api.post<{ codes: string[] }>("/api/security/recovery-codes");
      setCodes(res.codes);
      await refresh();
    } catch (err) {
      if (!isPasskeyCancel(err)) toast.error("Couldn't generate codes", { description: describePasskeyError(err) });
    }
  }

  async function signOutOthers() {
    const ok = await confirm({
      title: "Sign out other devices?",
      message: "Every other browser and device will need your password and passkey again. This one stays signed in.",
      confirmLabel: "Sign Out",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabaseBrowser().auth.signOut({ scope: "others" });
    if (error) toast.error("Couldn't sign out other devices", { description: error.message });
    else toast.success("Other devices signed out");
  }

  if (isPending) {
    return (
      <InsetGroup header="Passkeys">
        <SkeletonRows count={2} avatar={false} className="px-4 py-2" />
      </InsetGroup>
    );
  }
  if (isError || !data) {
    return (
      <InsetGroup header="Security">
        <ListRow label="Couldn't load security settings" description="Check your connection." accessory={<GlassButton size="sm" variant="soft" onClick={() => refetch()}>Retry</GlassButton>} />
      </InsetGroup>
    );
  }

  const isLast = data.passkeys.length <= 1;
  const passkeyFooter = data.passkeyRequired
    ? `After your password, every new sign-in asks for one of these. Keep at least two — e.g. iPhone and Mac — or your recovery codes.`
    : "Optional on this server: a passkey adds a second step after your password.";

  return (
    <div className="space-y-6">
      <InsetGroup header="Passkeys" footer={passkeyFooter}>
        {data.passkeys.map((p) => (
          <ListRow
            key={p.id}
            icon={p.backedUp ? <Cloud /> : <KeyRound />}
            label={passkeyLabel(p)}
            description={
              <>
                {p.backedUp ? "Synced" : "This device only"} · Added {formatDate(p.createdAt)}
                {p.lastUsedAt && (
                  <>
                    {" "}
                    · Used <RelativeTime date={p.lastUsedAt} />
                  </>
                )}
              </>
            }
            accessory={
              <Menu
                title={passkeyLabel(p)}
                trigger={<IconButton label={`Options for ${passkeyLabel(p)}`} icon={<MoreHorizontal />} variant="plain" />}
                items={[
                  { label: "Rename", icon: <Pencil />, onSelect: () => setRenaming(p) },
                  { label: "Remove", icon: <Trash2 />, destructive: true, disabled: isLast && data.passkeyRequired, onSelect: () => removePasskey(p) },
                ]}
              />
            }
          />
        ))}
        <ListRow icon={<Plus />} label={adding ? "Waiting for your passkey…" : `Add ${biometric === "passkey" ? "a passkey" : `${biometric} on this device`}`} onClick={addPasskey} disabled={adding} />
      </InsetGroup>

      {data.passkeys.length > 0 && (
        <InsetGroup header="Recovery codes" footer="One-time codes for when you can't use a passkey — e.g. a lost phone. Store them away from your devices.">
          <ListRow icon={<LifeBuoy />} label="Codes left" value={String(data.recoveryCodesLeft)} />
          <ListRow icon={<RefreshCw />} label="Generate new codes" onClick={regenerateCodes} />
        </InsetGroup>
      )}

      <InsetGroup header="Sign-in">
        <ListRow icon={<LockKeyhole />} label="Change password" chevron onClick={() => setPasswordOpen(true)} />
        <ListRow icon={<LogOut />} label="Sign out other devices" onClick={signOutOthers} />
      </InsetGroup>

      <RenameDialog
        key={renaming?.id ?? "closed"}
        passkey={renaming}
        onClose={() => setRenaming(null)}
        onSaved={() => {
          setRenaming(null);
          void refresh();
        }}
        ensureVerified={() => ensureVerified(data)}
      />
      <PasswordSheet open={passwordOpen} onOpenChange={setPasswordOpen} ensureVerified={() => ensureVerified(data)} />
      <Sheet open={!!codes} onOpenChange={() => {}} title="New recovery codes" description="Each code works once. You won't see them again." dismissible={false} hideClose>
        {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} doneLabel="Done" />}
      </Sheet>
    </div>
  );
}

function RenameDialog({ passkey, onClose, onSaved, ensureVerified }: { passkey: PasskeyInfo | null; onClose: () => void; onSaved: () => void; ensureVerified: () => Promise<void> }) {
  // Remounted per passkey (key below), so the initial name comes straight from props.
  const [name, setName] = useState(passkey?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!passkey) return;
    if (!name.trim()) {
      setError("Give it a name, like “iPhone”.");
      return;
    }
    setBusy(true);
    try {
      await ensureVerified();
      await api.patch(`/api/security/passkeys/${encodeURIComponent(passkey.id)}`, { name: name.trim() });
      onSaved();
    } catch (err) {
      setError(describePasskeyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!passkey}
      onOpenChange={(o) => !o && onClose()}
      title="Rename passkey"
      actions={
        <>
          <GlassButton variant="surface" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton variant="primary" onClick={() => save()} loading={busy}>
            Save
          </GlassButton>
        </>
      }
    >
      <form noValidate onSubmit={save}>
        <Field label="Name" error={error}>
          <GlassInput value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}

function PasswordSheet({ open, onOpenChange, ensureVerified }: { open: boolean; onOpenChange: (open: boolean) => void; ensureVerified: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});

  const reset = () => {
    setPassword("");
    setConfirmValue("");
    setErrors({});
  };

  async function save(): Promise<boolean> {
    const problem = passwordProblem(password);
    const found = problem ? { password: problem } : confirmValue !== password ? { confirm: "The passwords don't match." } : {};
    setErrors(found);
    if (Object.keys(found).length) return false;
    try {
      await ensureVerified();
      const res = await api.post<{ ok: true; otherSessionsSignedOut: boolean }>("/api/security/password", { password });
      toast.success("Password changed", { description: res.otherSessionsSignedOut ? "Other devices were signed out." : undefined });
      reset();
      return true;
    } catch (err) {
      setErrors({ form: describePasskeyError(err) });
      return false;
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title="Change password"
      cancel
      done="Save"
      onDone={save}
      dismissible={!password}
    >
      <form
        noValidate
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          void save().then((ok) => ok && onOpenChange(false));
        }}
        className="space-y-4 pt-2"
      >
        <p className="px-1 text-subhead text-fg-2">At least {PASSWORD_MIN_LENGTH} characters, with letters and numbers. Other devices are signed out afterwards.</p>
        {errors.form && (
          <p role="alert" className="rounded-sm bg-danger-soft px-3.5 py-2.5 text-footnote text-danger">
            {errors.form}
          </p>
        )}
        <Field label="New password" error={errors.password}>
          <GlassInput type="password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          <GlassInput type="password" name="confirm-password" autoComplete="new-password" value={confirmValue} onChange={(e) => setConfirmValue(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
