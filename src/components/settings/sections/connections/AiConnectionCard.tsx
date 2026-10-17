"use client";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { Field } from "@/components/ui/Field";
import { ListRow } from "@/components/ui/ListRow";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { toast } from "@/components/ui/Toast";
import type { AiConnectionView, UiAiProvider } from "@/lib/connections/ai";
import { useSaveAiConnection, useTestAiConnection } from "@/lib/queries/settings";
import { SecretField, secretPayload, type SecretDraft } from "../../parts/SecretField";
import { ConnectionCard, ConnectionStatusPill, EnvBanner, HelpLink, SaveButton, TestFooter } from "./shared";
import { ModelPicker } from "./ModelPicker";

const PROVIDERS: { value: UiAiProvider; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "off", label: "Off" },
];

const PROVIDER_NAME: Record<string, string> = { anthropic: "Anthropic", openrouter: "OpenRouter", "agent-sdk": "Claude subscription (Agent SDK)", off: "Off" };

const KEY_HELP: Record<"anthropic" | "openrouter", { href: string; site: string; placeholder: string }> = {
  anthropic: { href: "https://console.anthropic.com/settings/keys", site: "console.anthropic.com", placeholder: "sk-ant-…" },
  openrouter: { href: "https://openrouter.ai/settings/keys", site: "openrouter.ai", placeholder: "sk-or-v1-…" },
};

/** Remount key: a fresh draft whenever the saved settings change. */
export const aiViewKey = (v: AiConnectionView) => [v.source, v.storedProvider, v.secretHint, v.storedModels.main, v.storedModels.fast].join("|");

export function AiConnectionCard({ view }: { view: AiConnectionView }) {
  const save = useSaveAiConnection();
  const test = useTestAiConnection();
  const env = view.source === "env";

  // A stored provider without a usable key (or a row that only holds a test result) is "off".
  const initialProvider: UiAiProvider = view.provider === "off" ? "off" : (view.storedProvider ?? "off");
  const [provider, setProvider] = useState<UiAiProvider>(initialProvider);
  const [apiKey, setApiKey] = useState<SecretDraft>(undefined);
  const [models, setModels] = useState({ main: view.storedModels.main, fast: view.storedModels.fast });
  const [submitted, setSubmitted] = useState(false);

  // Saved settings changed (after a save, or elsewhere): start a fresh draft from them.
  const key = aiViewKey(view);
  const [seenKey, setSeenKey] = useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    setProvider(initialProvider);
    setApiKey(undefined);
    setModels({ main: view.storedModels.main, fast: view.storedModels.fast });
    setSubmitted(false);
  }

  const sameProvider = provider === view.storedProvider;
  const hasStoredKey = sameProvider && view.hasSecret;
  const keyError = provider !== "off" && !secretPayload(apiKey) && (!hasStoredKey || apiKey === null) ? "Paste an API key for this provider." : null;
  const dirty = provider !== initialProvider || apiKey === null || !!secretPayload(apiKey) || models.main !== view.storedModels.main || models.fast !== view.storedModels.fast;

  const switchProvider = (p: UiAiProvider) => {
    setProvider(p);
    setApiKey(undefined);
    setSubmitted(false);
    // Model ids differ per provider ("claude-…" vs "anthropic/claude-…"): start from its defaults.
    setModels(p === view.storedProvider ? { main: view.storedModels.main, fast: view.storedModels.fast } : { main: null, fast: null });
  };

  const runTest = () =>
    test.mutate(undefined, {
      onSuccess: (r) =>
        r.ok ? toast.success("AI connected", { description: `${r.model} answered in ${r.latencyMs} ms` }) : toast.error("Connection test failed", { description: r.error }),
      onError: (e) => toast.error("Connection test failed", { description: e.message }),
    });

  const onSave = () => {
    setSubmitted(true);
    if (keyError) return;
    save.mutate(
      { provider, apiKey: secretPayload(apiKey), mainModel: models.main, fastModel: models.fast },
      {
        onSuccess: () => {
          if (provider === "off") toast("AI turned off");
          else runTest();
        },
        onError: (e) => toast.error("Couldn't save", { description: e.message }),
      },
    );
  };

  const status = view.status;
  const testing = test.isPending;

  return (
    <ConnectionCard
      id="ai"
      title="AI"
      icon={<Sparkles />}
      busy={save.isPending || testing}
      status={<ConnectionStatusPill status={status} testing={testing} check={view.check} />}
      footer={
        <TestFooter status={status} check={view.check} detail={view.check?.model}>
          {view.provider !== "off" && (env || !dirty) && (
            <GlassButton size="sm" variant="surface" loading={testing} onClick={runTest}>
              Test connection
            </GlassButton>
          )}
          {!env && <SaveButton dirty={dirty} loading={save.isPending} onClick={onSave} label={provider === "off" ? "Save" : "Save & test"} />}
        </TestFooter>
      }
    >
      {env ? (
        <>
          <EnvBanner vars={view.envVars} what="The AI provider" />
          <div className="-mx-4 -my-2">
            <ListRow label="Provider" value={PROVIDER_NAME[view.provider]} />
            {view.secretHint && <ListRow label="API key" value={<span className="font-mono">{view.secretHint}</span>} />}
            <ListRow label="Main model" description={<span className="font-mono">{view.mainModel}</span>} />
            <ListRow label="Fast model" description={<span className="font-mono">{view.fastModel}</span>} />
          </div>
        </>
      ) : (
        <>
          <SegmentedControl aria-label="AI provider" fullWidth className="[&>button]:px-1.5" value={provider} onChange={switchProvider} items={PROVIDERS} />

          {provider === "off" ? (
            <p className="text-subhead text-fg-2">Chat, imports and AI suggestions are unavailable while AI is off. Everything else works as usual.</p>
          ) : (
            <>
              <Field
                label="API key"
                error={submitted ? keyError : null}
                hint={
                  <>
                    Create one at <HelpLink href={KEY_HELP[provider].href}>{KEY_HELP[provider].site}</HelpLink>. Stored encrypted; it&apos;s never shown again.
                  </>
                }
              >
                <SecretField
                  label="API key"
                  value={apiKey}
                  onChange={(v) => setApiKey(v)}
                  hasSecret={hasStoredKey}
                  hint={sameProvider ? view.secretHint : null}
                  placeholder={KEY_HELP[provider].placeholder}
                  invalid={submitted && !!keyError}
                />
              </Field>
              {view.secretError && sameProvider && <p className="text-footnote text-danger">{view.secretError} Paste the key again.</p>}

              <div className="grid gap-5 @lg:grid-cols-2 @lg:gap-4">
                <Field label="Main model" hint="Chat, imports and longer answers.">
                  <ModelPicker label="Main model" provider={provider} value={models.main} onChange={(main) => setModels((m) => ({ ...m, main }))} defaultModel={view.defaults[provider].main} />
                </Field>
                <Field label="Fast model" hint="Quick classification and suggestions.">
                  <ModelPicker label="Fast model" provider={provider} value={models.fast} onChange={(fast) => setModels((m) => ({ ...m, fast }))} defaultModel={view.defaults[provider].fast} />
                </Field>
              </div>
            </>
          )}
        </>
      )}
    </ConnectionCard>
  );
}
