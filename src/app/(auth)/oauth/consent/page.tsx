import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { GlassCard } from "@/components/glass/GlassCard";
import { Logo } from "@/components/shell/Logo";
import { getOwner } from "@/lib/auth/server";
import { clientEnv } from "@/lib/env";
import { consentPolicy, redirectHost, redirectProblem } from "@/lib/mcp/consent";
import { supabaseServer } from "@/lib/supabase/server";
import { CancelConsent, ConsentForm, ReconnectForm } from "./ConsentForm";

/**
 * OAuth consent for MCP connectors (claude.ai, ChatGPT …). Supabase Auth's OAuth server sends the
 * browser here with `?authorization_id=…` (Auth → OAuth Server → "Authorization path"). The page
 * needs a full session — the proxy signs the owner in (and through the passkey step) first and
 * brings them back with the query string intact.
 *
 * Nothing is handed to an app without a click: an app approved before gets a "Continue" step
 * (Supabase issues its code without asking, and a link alone must not open the window in which
 * /api/mcp accepts a new session — see src/lib/mcp/approvals.ts). Apps that want the code sent to
 * the owner's own computer are turned away towards personal access tokens (src/lib/mcp/consent.ts).
 */

export const metadata = { title: "Connect an app" };

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <div className="app-bg" aria-hidden />
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={48} />
          <p className="text-subhead text-fg-2">The Network</p>
        </div>
        {children}
      </div>
    </main>
  );
}

function Problem({ title, message, children }: { title: string; message: ReactNode; children?: ReactNode }) {
  return (
    <Shell>
      <GlassCard strong className="space-y-5 p-6">
        <div className="space-y-2 text-center">
          <h1 className="text-title3 text-fg">{title}</h1>
          <p className="text-subhead text-fg-2">{message}</p>
        </div>
        {children}
      </GlassCard>
    </Shell>
  );
}

function LocalApp({ clientName, host, children }: { clientName: string; host: string; children?: ReactNode }) {
  return (
    <Problem
      title="Use a personal access token"
      message={
        <>
          {clientName} runs on your computer (it asked to come back to <span className="font-medium text-fg">{host}</span>). Apps like Claude Code,
          Cursor or desktop clients connect with a token from{" "}
          <Link href="/settings/apps" className="font-medium text-accent-text">
            Settings → Connected apps
          </Link>{" "}
          instead.
        </>
      }
    >
      {children}
    </Problem>
  );
}

export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const raw = (await searchParams).authorization_id;
  const authorizationId = typeof raw === "string" && raw.length <= 200 ? raw : null;
  if (!authorizationId) return <Problem title="Nothing to approve" message="This page is opened by an app that wants to connect to your network." />;

  const owner = await getOwner();
  if (!owner?.mfaSatisfied) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return <Problem title="Request expired" message="This connection request is no longer valid. Start connecting again from the app." />;
  const policy = consentPolicy(clientEnv.NEXT_PUBLIC_APP_URL);

  if ("redirect_url" in data) {
    const host = redirectHost(data.redirect_url);
    if (redirectProblem(data.redirect_url, policy)) return <LocalApp clientName="This app" host={host} />;
    return (
      <Problem
        title={`Reconnect ${host}?`}
        message="You connected this app before. Continue if you just asked it to reconnect; if you didn't, close this page."
      >
        <ReconnectForm redirectUrl={data.redirect_url} />
      </Problem>
    );
  }
  if (data.user.id !== owner.id) return <Problem title="Wrong account" message={`This request is for ${data.user.email}. Sign in with that account to continue.`} />;

  const clientName = data.client.name || "An app";
  if (redirectProblem(data.redirect_uri, policy)) {
    return (
      <LocalApp clientName={clientName} host={redirectHost(data.redirect_uri)}>
        <CancelConsent authorizationId={authorizationId} />
      </LocalApp>
    );
  }
  return (
    <Shell>
      <GlassCard strong className="space-y-5 p-6">
        <div className="space-y-1.5 text-center">
          <h1 className="text-title2 text-balance text-fg">{clientName} wants to connect to your network</h1>
          <p className="text-subhead text-fg-2">
            Signed in as {data.user.email}. You&apos;ll go back to <span className="font-medium text-fg">{redirectHost(data.redirect_uri)}</span>.
          </p>
        </div>
        <ConsentForm authorizationId={authorizationId} clientName={clientName} />
        <p className="text-center text-footnote text-fg-3">You can disconnect it any time in Settings → Connected apps.</p>
      </GlassCard>
    </Shell>
  );
}
