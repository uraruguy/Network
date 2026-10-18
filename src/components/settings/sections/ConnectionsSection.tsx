"use client";
import { ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAiConnection, useEmailConnection, useProfile } from "@/lib/queries/settings";
import { SectionPage } from "../SettingsShell";
import { AiConnectionCard } from "./connections/AiConnectionCard";
import { EmailConnectionCard } from "./connections/EmailConnectionCard";

function CardSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="mx-4 h-4 w-16 rounded-full" />
      <div className="surface space-y-4 rounded-lg p-4">
        <Skeleton className="h-9 w-full rounded-full" />
        <Skeleton className="h-11 w-full rounded-sm" />
        <Skeleton className="h-11 w-2/3 rounded-sm" />
      </div>
    </div>
  );
}

export function ConnectionsSection() {
  const ai = useAiConnection();
  const email = useEmailConnection();
  const { data: profile } = useProfile();
  const ready = !!ai.data && !!email.data;

  // Deep links (/settings/connections#email) land before the cards exist: scroll once they do.
  useEffect(() => {
    if (!ready) return;
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [ready]);

  return (
    <SectionPage id="connections" description="Bring your own AI key and e-mail sender. You can change providers any time.">
      {ai.data ? <AiConnectionCard view={ai.data} /> : ai.isError ? <LoadError what="AI settings" message={ai.error.message} /> : <CardSkeleton />}
      {email.data ? (
        <EmailConnectionCard view={email.data} ownerEmail={profile?.email ?? null} />
      ) : email.isError ? (
        <LoadError what="e-mail settings" message={email.error.message} />
      ) : (
        <CardSkeleton />
      )}
      <p className="flex gap-2 px-4 text-footnote text-fg-3">
        <ShieldCheck size={16} className="mt-px shrink-0" aria-hidden />
        <span>
          Keys and passwords are encrypted (AES-256-GCM, with a key derived from your APP_SECRET) before they&apos;re stored, and never sent back to the browser. Values set as environment variables
          always win and can only be changed in your deployment.
        </span>
      </p>
    </SectionPage>
  );
}

function LoadError({ what, message }: { what: string; message: string }) {
  return (
    <div role="alert" className="surface rounded-lg p-4 text-subhead text-danger">
      Couldn&apos;t load {what}: {message}
    </div>
  );
}
