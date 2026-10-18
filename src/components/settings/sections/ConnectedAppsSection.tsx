"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Copy, KeyRound, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { confirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { api } from "@/lib/api";

/**
 * Settings → Connected apps: connect AI apps to the network over MCP.
 *  - Personal access tokens for apps that take a token (Claude Code, Cursor …): create (shown
 *    once, with ready-to-paste setup), list, revoke.
 *  - OAuth apps approved on the consent page (claude.ai, ChatGPT …): list, disconnect.
 */

type Scope = "network:read" | "network:write";
type TokenItem = { id: string; name: string; tokenPrefix: string; scopes: Scope[]; lastUsedAt: string | null; createdAt: string };
type GrantItem = { clientId: string; clientName: string | null; scopes: Scope[]; grantedAt: string; lastUsedAt: string | null };
type ConnectedApps = { mcpUrl: string; tokens: TokenItem[]; grants: GrantItem[] };
type Access = "read" | "write";

const KEY = ["connected-apps"] as const;
const accessLabel = (scopes: Scope[]) => (scopes.includes("network:write") ? "Read & write" : "Read only");

function useConnectedApps() {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<ConnectedApps>("/api/tokens"), staleTime: 30_000, meta: { persist: false } });
}

/**
 * Security actions run now or fail loudly — never queued for later (a revoke that silently waits
 * for a connection would leave access open). No retries, no offline pause.
 */
const ONLINE_ONLY = { networkMode: "always", retry: 0 } as const;

const failure = (e: Error) => (e instanceof TypeError ? "You’re offline. Connect to the internet and try again." : e.message);

async function copy(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Couldn't copy — select the text and copy it manually.");
  }
}

function Used({ at }: { at: string | null }) {
  return at ? (
    <>
      used <RelativeTime date={at} />
    </>
  ) : (
    <>never used</>
  );
}

export function ConnectedAppsSection() {
  const qc = useQueryClient();
  const { data, isPending, isError } = useConnectedApps();
  const [creating, setCreating] = useState(false);

  const revokeToken = useMutation({
    ...ONLINE_ONLY,
    mutationFn: (id: string) => api.delete(`/api/tokens/${id}`),
    onSuccess: () => toast.success("Token revoked"),
    onError: (e: Error) => toast.error("Couldn't revoke the token", { description: failure(e) }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const revokeGrant = useMutation({
    ...ONLINE_ONLY,
    mutationFn: (clientId: string) => api.delete(`/api/tokens/grants?client=${encodeURIComponent(clientId)}`),
    onSuccess: () => toast.success("App disconnected"),
    onError: (e: Error) => toast.error("Couldn't disconnect the app", { description: failure(e) }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const mcpUrl = data?.mcpUrl ?? "";

  return (
    <section id="connected-apps" className="space-y-6" aria-labelledby="connected-apps-title">
      <div className="space-y-1 px-1">
        <h2 id="connected-apps-title" className="text-title3 text-fg">
          Connected apps
        </h2>
        <p className="text-subhead text-fg-2">Use your network from Claude, ChatGPT, Cursor and other AI apps (MCP).</p>
      </div>

      <InsetGroup header="Server URL" footer="Paste this into the app you're connecting.">
        <ListRow
          label={<span className="font-mono text-subhead">{mcpUrl || "…"}</span>}
          accessory={
            <GlassButton variant="plain" size="sm" disabled={!mcpUrl} onClick={() => copy(mcpUrl, "URL copied")}>
              <Copy size={14} /> Copy
            </GlassButton>
          }
        />
      </InsetGroup>

      <InsetGroup
        header="Apps signed in with your account"
        footer="Apps you approved when they asked to connect (e.g. a claude.ai connector). Disconnecting stops them immediately."
      >
        {isPending ? (
          <SkeletonRows count={1} avatar={false} />
        ) : !data?.grants.length ? (
          <ListRow icon={<Bot />} label="No apps connected yet" description="Add the server URL as a connector in claude.ai or ChatGPT." />
        ) : (
          data.grants.map((g) => (
            <ListRow
              key={g.clientId}
              icon={<Bot />}
              label={g.clientName ?? "OAuth app"}
              description={
                <>
                  {accessLabel(g.scopes)} · connected <RelativeTime date={g.grantedAt} /> · <Used at={g.lastUsedAt} />
                </>
              }
              accessory={
                <GlassButton
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    if (await confirm({ title: `Disconnect ${g.clientName ?? "this app"}?`, message: "It loses access right away. You can connect it again later.", confirmLabel: "Disconnect", destructive: true }))
                      revokeGrant.mutate(g.clientId);
                  }}
                >
                  Disconnect
                </GlassButton>
              }
            />
          ))
        )}
      </InsetGroup>

      <InsetGroup
        header="Personal access tokens"
        headerAction={
          <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 font-medium text-accent-text normal-case">
            <Plus size={14} strokeWidth={2.6} /> New token
          </button>
        }
        footer="For apps that take a token instead of signing in, like Claude Code and Cursor. Treat tokens like passwords."
      >
        {isPending ? (
          <SkeletonRows count={2} avatar={false} />
        ) : isError ? (
          <ListRow icon={<TriangleAlert />} label="Couldn't load tokens" destructive />
        ) : !data?.tokens.length ? (
          <ListRow icon={<KeyRound />} label="No tokens" description="Create one to connect Claude Code or Cursor." onClick={() => setCreating(true)} chevron />
        ) : (
          data.tokens.map((t) => (
            <ListRow
              key={t.id}
              icon={<KeyRound />}
              label={t.name}
              description={
                <>
                  <span className="font-mono">{t.tokenPrefix}…</span> · {accessLabel(t.scopes)} · <Used at={t.lastUsedAt} />
                </>
              }
              accessory={
                <GlassButton
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    if (await confirm({ title: `Revoke “${t.name}”?`, message: "Apps using this token lose access immediately.", confirmLabel: "Revoke", destructive: true }))
                      revokeToken.mutate(t.id);
                  }}
                >
                  Revoke
                </GlassButton>
              }
            />
          ))
        )}
      </InsetGroup>

      <HowToConnect mcpUrl={mcpUrl} />

      <CreateTokenDialog open={creating} onOpenChange={setCreating} mcpUrl={mcpUrl} onCreated={() => qc.invalidateQueries({ queryKey: KEY })} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Setup instructions                                                  */
/* ------------------------------------------------------------------ */

type Client = "claude-ai" | "claude-code" | "cursor" | "chatgpt";

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-subhead text-fg-2 marker:text-fg-3">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-sm border-[0.5px] border-hairline bg-fill-1 py-3 pr-12 pl-3.5 font-mono text-footnote leading-relaxed whitespace-pre text-fg">{code}</pre>
      <button
        type="button"
        onClick={() => copy(code)}
        aria-label={`Copy ${label}`}
        className="pressable absolute top-2 right-2 grid size-8 place-items-center rounded-xs bg-surface-2 text-fg-2 shadow-e1 hover:text-fg"
      >
        <Copy size={14} />
      </button>
    </div>
  );
}

const claudeCodeCommand = (url: string, token: string) => `claude mcp add --transport http network ${url} \\\n  --header "Authorization: Bearer ${token}"`;
const cursorConfig = (url: string, token: string) =>
  JSON.stringify({ mcpServers: { network: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);

function HowToConnect({ mcpUrl }: { mcpUrl: string }) {
  const [client, setClient] = useState<Client>("claude-ai");
  const url = mcpUrl || "https://your-network.example/api/mcp";
  return (
    <InsetGroup header="How to connect">
      <div className="space-y-4 p-4">
        <SegmentedControl<Client>
          fullWidth
          size="sm"
          aria-label="App"
          value={client}
          onChange={setClient}
          items={[
            { value: "claude-ai", label: "claude.ai" },
            { value: "claude-code", label: "Claude Code" },
            { value: "cursor", label: "Cursor" },
            { value: "chatgpt", label: "ChatGPT" },
          ]}
        />
        {client === "claude-ai" && (
          <Steps
            items={[
              <>In Claude (web, desktop or mobile) open Settings → Connectors → Add custom connector.</>,
              <>
                Name it “The Network” and paste the server URL: <span className="font-mono text-fg break-all">{url}</span>
              </>,
              <>Click Connect, sign in to The Network, choose Read only or Read &amp; write, and Allow.</>,
              <>In a chat, enable the connector from the tools menu and ask about your people.</>,
            ]}
          />
        )}
        {client === "chatgpt" && (
          <Steps
            items={[
              <>In ChatGPT open Settings → Apps &amp; Connectors → Advanced, and turn on Developer mode.</>,
              <>
                Create a connector with the server URL <span className="font-mono text-fg break-all">{url}</span> and OAuth authentication.
              </>,
              <>Sign in to The Network when asked, choose the access level, and Allow.</>,
            ]}
          />
        )}
        {client === "claude-code" && (
          <div className="space-y-3">
            <p className="text-subhead text-fg-2">Create a token below, then run this in a terminal (the dialog fills in your token):</p>
            <CodeBlock label="command" code={claudeCodeCommand(url, "ntk_…")} />
          </div>
        )}
        {client === "cursor" && (
          <div className="space-y-3">
            <p className="text-subhead text-fg-2">
              Create a token below, then add this to <span className="font-mono text-fg">~/.cursor/mcp.json</span> (the dialog fills in your token):
            </p>
            <CodeBlock label="configuration" code={cursorConfig(url, "ntk_…")} />
          </div>
        )}
      </div>
    </InsetGroup>
  );
}

/* ------------------------------------------------------------------ */
/*  Create token                                                        */
/* ------------------------------------------------------------------ */

function CreateTokenDialog({ open, onOpenChange, mcpUrl, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; mcpUrl: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [access, setAccess] = useState<Access>("read");
  const [created, setCreated] = useState<{ token: string; name: string; mcpUrl: string } | null>(null);
  const [target, setTarget] = useState<"claude-code" | "cursor">("claude-code");
  const [copied, setCopied] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const create = useMutation({
    ...ONLINE_ONLY,
    mutationFn: () => api.post<{ token: string; item: TokenItem; mcpUrl: string }>("/api/tokens", { name: name.trim(), access }),
    onSuccess: (res) => {
      setCreated({ token: res.token, name: res.item.name, mcpUrl: res.mcpUrl || mcpUrl });
      onCreated();
    },
    onError: (e: Error) => toast.error("Couldn't create the token", { description: failure(e) }),
  });

  const reset = () => {
    setName("");
    setAccess("read");
    setCreated(null);
    setCopied(false);
    setNameError(null);
    create.reset();
  };

  const submit = () => {
    if (!name.trim()) return setNameError("Give the token a name, e.g. the app and device it's for.");
    setNameError(null);
    create.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(o) => !o && reset()}
      width={520}
      dismissible={!created}
      title={created ? "Your new token" : "New access token"}
      description={created ? "Copy it now — it won't be shown again." : "A token lets one app use your network without signing in."}
      actions={
        created ? (
          <GlassButton variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </GlassButton>
        ) : (
          <>
            <GlassButton variant="surface" onClick={() => onOpenChange(false)}>
              Cancel
            </GlassButton>
            <GlassButton variant="primary" loading={create.isPending} onClick={submit}>
              Create token
            </GlassButton>
          </>
        )
      }
    >
      {!created ? (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Name" error={nameError}>
            <GlassInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Code on my MacBook" maxLength={60} autoFocus />
          </Field>
          <Field label="Access" hint={access === "write" ? "Can also add notes, people and follow-ups. Nothing can be deleted." : "Can search people and read notes and follow-ups."}>
            <SegmentedControl<Access>
              fullWidth
              aria-label="Access"
              value={access}
              onChange={setAccess}
              items={[
                { value: "read", label: "Read only" },
                { value: "write", label: "Read & write" },
              ]}
            />
          </Field>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-sm border-[0.5px] border-hairline bg-fill-1 p-1.5 pl-3.5">
            <code className="min-w-0 flex-1 truncate font-mono text-footnote text-fg select-all">{created.token}</code>
            <GlassButton
              variant={copied ? "soft" : "primary"}
              size="sm"
              onClick={async () => {
                await copy(created.token, "Token copied");
                setCopied(true);
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </GlassButton>
          </div>

          <div className="space-y-3">
            <SegmentedControl
              size="sm"
              aria-label="Set up"
              value={target}
              onChange={setTarget}
              items={[
                { value: "claude-code", label: "Claude Code" },
                { value: "cursor", label: "Cursor" },
              ]}
            />
            {target === "claude-code" ? (
              <>
                <p className="text-footnote text-fg-3">Run in a terminal:</p>
                <CodeBlock label="command" code={claudeCodeCommand(created.mcpUrl, created.token)} />
              </>
            ) : (
              <>
                <p className="text-footnote text-fg-3">
                  Add to <span className="font-mono">~/.cursor/mcp.json</span>:
                </p>
                <CodeBlock label="configuration" code={cursorConfig(created.mcpUrl, created.token)} />
              </>
            )}
            <p className="text-footnote text-fg-3">For claude.ai and ChatGPT you don&apos;t need a token: add the server URL as a connector and sign in.</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
