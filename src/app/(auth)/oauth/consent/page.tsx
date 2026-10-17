import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { GlassCard } from "@/components/glass/GlassCard";
import { Logo } from "@/components/shell/Logo";
import { getOwner } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { ConsentForm } from "./ConsentForm";

/**
 * OAuth consent for MCP connectors (claude.ai, ChatGPT …). Supabase Auth's OAuth server sends the
 * browser here with `?authorization_id=…` (Auth → OAuth Server → "Authorization path"). The page
 * needs a full session — the proxy signs the owner in (and through the passkey step) first and
 * brings them back with the query string intact.
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

function Problem({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <GlassCard strong className="space-y-2 p-6 text-center">
        <h1 className="text-title3 text-fg">{title}</h1>
        <p className="text-subhead text-fg-2">{message}</p>
      </GlassCard>
    </Shell>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const raw = (await searchParams).authorization_id;
  const authorizationId = typeof raw === "string" && raw.length <= 200 ? raw : null;
  if (!authorizationId) return <Problem title="Nothing to approve" message="This page is opened by an app that wants to connect to your network." />;

  const owner = await getOwner();
  if (!owner?.mfaSatisfied) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return <Problem title="Request expired" message="This connection request is no longer valid. Start connecting again from the app." />;
  // Already approved earlier (and not revoked): straight back to the app.
  if ("redirect_url" in data) redirect(data.redirect_url);
  if (data.user.id !== owner.id) return <Problem title="Wrong account" message={`This request is for ${data.user.email}. Sign in with that account to continue.`} />;

  const clientName = data.client.name || "An app";
  return (
    <Shell>
      <GlassCard strong className="space-y-5 p-6">
        <div className="space-y-1.5 text-center">
          <h1 className="text-title2 text-balance text-fg">{clientName} wants to connect to your network</h1>
          <p className="text-subhead text-fg-2">
            Signed in as {data.user.email}. You&apos;ll go back to <span className="font-medium text-fg">{hostOf(data.redirect_uri)}</span>.
          </p>
        </div>
        <ConsentForm authorizationId={authorizationId} clientName={clientName} />
        <p className="text-center text-footnote text-fg-3">You can disconnect it any time in Settings → Connected apps.</p>
      </GlassCard>
    </Shell>
  );
}
