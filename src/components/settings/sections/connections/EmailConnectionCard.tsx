"use client";
import { Mail } from "lucide-react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "@/components/ui/Field";
import { ListRow } from "@/components/ui/ListRow";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";
import type { EmailConnectionView, UiEmailProvider } from "@/lib/connections/email";
import { useSaveEmailConnection, useTestEmailConnection } from "@/lib/queries/settings";
import { SecretField, secretPayload, type SecretDraft } from "../../parts/SecretField";
import { ConnectionCard, ConnectionStatusPill, EnvBanner, HelpLink, SaveButton, TestFooter } from "./shared";

const PROVIDERS: { value: UiEmailProvider; label: string }[] = [
  { value: "resend", label: "Resend" },
  { value: "smtp", label: "SMTP" },
  { value: "off", label: "Off" },
];

const FROM_RE = /^(?:[^<>@\r\n]*<\s*[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\s*>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;
const HOST_RE = /^[\w.-]+$/;

type Draft = { provider: UiEmailProvider; from: string; apiKey: SecretDraft; host: string; port: string; secure: boolean; user: string; pass: SecretDraft };

function initial(v: EmailConnectionView): Draft {
  return {
    provider: v.provider === "off" ? "off" : (v.storedProvider ?? "off"),
    from: v.storedProvider && v.from !== v.defaultFrom ? v.from : "",
    apiKey: undefined,
    host: v.smtp.host ?? "",
    port: v.smtp.port ? String(v.smtp.port) : "",
    secure: v.smtp.secure,
    user: v.smtp.user ?? "",
    pass: undefined,
  };
}

const viewKey = (v: EmailConnectionView) => [v.source, v.storedProvider, v.from, v.resend.secretHint, v.smtp.host, v.smtp.port, v.smtp.secure, v.smtp.user, v.smtp.secretHint].join("|");

export function EmailConnectionCard({ view, ownerEmail }: { view: EmailConnectionView; ownerEmail: string | null }) {
  const save = useSaveEmailConnection();
  const test = useTestEmailConnection();
  const env = view.source === "env";
  const [d, setD] = useState<Draft>(() => initial(view));
  const [submitted, setSubmitted] = useState(false);

  const key = viewKey(view);
  const [seenKey, setSeenKey] = useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    setD(initial(view));
    setSubmitted(false);
  }

  const base = initial(view);
  const set = <K extends keyof Draft>(k: K, value: Draft[K]) => setD((x) => ({ ...x, [k]: value }));
  const sameProvider = d.provider === view.storedProvider;

  const errors = {
    from: d.from.trim() && !FROM_RE.test(d.from.trim()) ? "Use an address like “The Network <hello@example.com>”." : null,
    apiKey: d.provider === "resend" && !secretPayload(d.apiKey) && (!(sameProvider && view.resend.hasSecret) || d.apiKey === null) ? "Paste your Resend API key." : null,
    host: d.provider === "smtp" && !d.host.trim() ? "Add the server's host name." : d.provider === "smtp" && !HOST_RE.test(d.host.trim()) ? "Host name only, e.g. smtp.example.com." : null,
    port: d.provider === "smtp" && d.port.trim() && !(Number(d.port) >= 1 && Number(d.port) <= 65535 && Number.isInteger(Number(d.port))) ? "1–65535." : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const dirty =
    d.provider !== base.provider ||
    d.from.trim() !== base.from ||
    d.apiKey === null ||
    !!secretPayload(d.apiKey) ||
    d.pass === null ||
    !!secretPayload(d.pass) ||
    (d.provider === "smtp" && (d.host.trim() !== base.host || d.port.trim() !== base.port || d.secure !== base.secure || d.user.trim() !== base.user));

  const switchProvider = (p: UiEmailProvider) => {
    setD((x) => ({ ...x, provider: p, apiKey: undefined, pass: undefined }));
    setSubmitted(false);
  };

  const runTest = () =>
    test.mutate(undefined, {
      onSuccess: (r) => (r.ok ? toast.success("Test e-mail sent", { description: `Check ${r.to}` }) : toast.error("Test e-mail failed", { description: r.error })),
      onError: (e) => toast.error("Test e-mail failed", { description: e.message }),
    });

  const onSave = () => {
    setSubmitted(true);
    if (invalid) return;
    save.mutate(
      {
        provider: d.provider,
        from: d.from.trim() || null,
        ...(d.provider === "resend" ? { apiKey: secretPayload(d.apiKey) } : {}),
        ...(d.provider === "smtp"
          ? { smtp: { host: d.host.trim(), port: d.port.trim() ? Number(d.port) : null, secure: d.secure, user: d.user.trim() || null, pass: secretPayload(d.pass) } }
          : {}),
      },
      {
        onSuccess: () => {
          if (d.provider === "off") toast("E-mail turned off");
          else runTest();
        },
        onError: (e) => toast.error("Couldn't save", { description: e.message }),
      },
    );
  };

  const testing = test.isPending;
  const canTest = view.provider !== "off" && (env || !dirty);
  const err = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  return (
    <ConnectionCard
      id="email"
      title="E-mail"
      icon={<Mail />}
      busy={save.isPending || testing}
      status={<ConnectionStatusPill status={view.status} testing={testing} check={view.check} />}
      footer={
        <TestFooter status={view.status} check={view.check} detail={view.check?.latencyMs ? `${view.check.latencyMs} ms` : undefined}>
          {canTest && (
            <GlassButton size="sm" variant="surface" loading={testing} onClick={runTest}>
              Send test e-mail
            </GlassButton>
          )}
          {!env && <SaveButton dirty={dirty} loading={save.isPending} onClick={onSave} label={d.provider === "off" ? "Save" : "Save & send test"} />}
        </TestFooter>
      }
    >
      {env ? (
        <>
          <EnvBanner vars={view.envVars} what="E-mail sending" />
          <div className="-mx-4 -my-2">
            <ListRow label="Provider" value={view.provider === "smtp" ? "SMTP" : view.provider === "resend" ? "Resend" : "Off"} />
            <ListRow label="From" description={view.from} />
            {view.resend.secretHint && <ListRow label="API key" value={<span className="font-mono">{view.resend.secretHint}</span>} />}
            {view.smtp.url && <ListRow label="Server" description={<span className="font-mono">{view.smtp.url}</span>} />}
          </div>
        </>
      ) : (
        <>
          <SegmentedControl aria-label="E-mail provider" fullWidth className="[&>button]:px-1.5" value={d.provider} onChange={switchProvider} items={PROVIDERS} />

          {d.provider === "off" ? (
            <p className="text-subhead text-fg-2">No e-mail is sent — the daily digest is skipped. Reminders still show on Today.</p>
          ) : (
            <>
              <Field
                label="From"
                error={err("from")}
                hint={
                  d.provider === "resend" ? (
                    <>
                      A sender on a domain you verified in Resend. Leave empty for <span className="font-mono">{view.defaultFrom}</span>.
                    </>
                  ) : (
                    <>An address your SMTP server may send as. Leave empty for {view.defaultFrom}.</>
                  )
                }
              >
                <GlassInput value={d.from} onChange={(e) => set("from", e.target.value)} placeholder={view.defaultFrom} autoComplete="off" spellCheck={false} inputMode="email" />
              </Field>

              {d.provider === "resend" ? (
                <Field
                  label="Resend API key"
                  error={err("apiKey")}
                  hint={
                    <>
                      Create one at <HelpLink href="https://resend.com/api-keys">resend.com/api-keys</HelpLink> with “Sending access”.
                    </>
                  }
                >
                  <SecretField
                    label="Resend API key"
                    value={d.apiKey}
                    onChange={(v) => set("apiKey", v)}
                    hasSecret={sameProvider && view.resend.hasSecret}
                    hint={sameProvider ? view.resend.secretHint : null}
                    placeholder="re_…"
                    invalid={!!err("apiKey")}
                  />
                </Field>
              ) : (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
                    <Field label="SMTP server" error={err("host")}>
                      <GlassInput value={d.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.example.com" autoComplete="off" autoCapitalize="off" spellCheck={false} />
                    </Field>
                    <Field label="Port" error={err("port")}>
                      <GlassInput value={d.port} onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))} placeholder={d.secure ? "465" : "587"} inputMode="numeric" maxLength={5} />
                    </Field>
                  </div>
                  <div className="rounded-sm bg-fill-1 px-3">
                    <Switch label="SSL/TLS" description={d.secure ? "Encrypted from the start (usually port 465)." : "STARTTLS when the server offers it (usually port 587)."} checked={d.secure} onCheckedChange={(v) => set("secure", v)} />
                  </div>
                  <div className="grid gap-5 @lg:grid-cols-2 @lg:gap-4">
                    <Field label="Username" hint="Leave empty if the server needs no login.">
                      <GlassInput value={d.user} onChange={(e) => set("user", e.target.value)} placeholder="you@example.com" autoComplete="off" autoCapitalize="off" spellCheck={false} />
                    </Field>
                    <Field label="Password">
                      <SecretField
                        label="SMTP password"
                        value={d.pass}
                        onChange={(v) => set("pass", v)}
                        hasSecret={sameProvider && view.smtp.hasSecret}
                        hint={sameProvider ? view.smtp.secretHint : null}
                        placeholder="App password"
                      />
                    </Field>
                  </div>
                </>
              )}
              {view.secretError && sameProvider && <p className="text-footnote text-danger">{view.secretError} Enter it again.</p>}
            </>
          )}
        </>
      )}
      {!env && ownerEmail && d.provider !== "off" && <p className="text-footnote text-fg-3">Test e-mails go to {ownerEmail}.</p>}
    </ConnectionCard>
  );
}
