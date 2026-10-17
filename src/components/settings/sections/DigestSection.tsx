"use client";
import { CalendarClock, ExternalLink, Globe, MailWarning, Send, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { Select } from "@/components/ui/Select";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";
import { useNow } from "@/lib/clock";
import { useEmailConnection, useProfile, useSendDigestPreview, useSetupStatus, useUpdateProfile } from "@/lib/queries/settings";
import { addDays, localDate, nextLocalHour, safeTimeZone } from "@/lib/time/zoned";
import { SectionPage } from "../SettingsShell";
import { formatHour } from "../useSectionValues";

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: formatHour(h) }));

function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

export function DigestSection() {
  const { data: profile, isPending } = useProfile();
  const update = useUpdateProfile();
  const { data: email } = useEmailConnection();
  const { data: setup } = useSetupStatus();
  const sendPreview = useSendDigestPreview();
  const now = useNow();

  const schedule = useMemo(() => {
    if (!profile) return null;
    const tz = safeTimeZone(profile.timezone);
    const at = new Date(now);
    const today = localDate(at, tz);
    let next = nextLocalHour(at, tz, profile.digestHour);
    // Already sent today → the next one is tomorrow.
    if (profile.lastDigestOn === today && localDate(next, tz) === today) next = nextLocalHour(new Date(next.getTime() + 60 * 60_000), tz, profile.digestHour);
    return { tz, today, nextDay: localDate(next, tz) };
  }, [profile, now]);

  if (isPending || !profile || !schedule) {
    return (
      <SectionPage id="digest">
        <div className="surface overflow-hidden rounded-lg">
          <SkeletonRows count={3} avatar={false} />
        </div>
      </SectionPage>
    );
  }

  const enabled = profile.digestEnabled;
  const digestItem = setup?.items.find((i) => i.id === "digest");
  const save = (patch: Parameters<typeof update.mutate>[0]) => update.mutate(patch, { onError: (e) => toast.error("Couldn't save", { description: e.message }) });

  const onSendPreview = () =>
    sendPreview.mutate(undefined, {
      onSuccess: (r) => (r.ok ? toast.success("Preview sent", { description: `Check ${r.to}` }) : toast.error("Couldn't send the preview", { description: r.error })),
      onError: (e) => toast.error("Couldn't send the preview", { description: e.message }),
    });

  return (
    <SectionPage id="digest" description="One calm e-mail on the mornings someone is due a follow-up or has a birthday coming up.">
      <InsetGroup
        footer={
          enabled
            ? `Next possible digest: ${dayLabel(schedule.nextDay, schedule.today)} at ${formatHour(profile.digestHour)} (${schedule.tz.replace(/_/g, " ")}). Nothing is sent on days with nothing due.${profile.lastDigestOn ? ` Last sent: ${dayLabel(profile.lastDigestOn, schedule.today)}.` : ""}`
            : "Turned off — reminders still show on Today."
        }
      >
        <div className="px-4">
          <Switch label="Daily digest" description="Who to contact today, overdue follow-ups, birthdays this week" checked={enabled} onCheckedChange={(v) => save({ digestEnabled: v })} />
        </div>
        <div className="mx-4 h-[0.5px] bg-separator" />
        <ListRow
          icon={<CalendarClock />}
          label="Send at"
          disabled={!enabled}
          accessory={
            <div className="w-[112px]">
              <Select aria-label="Send at" size="sm" value={String(profile.digestHour)} onChange={(h) => save({ digestHour: Number(h) })} options={HOURS} disabled={!enabled} />
            </div>
          }
        />
        <ListRow icon={<Globe />} label="Time zone" value={schedule.tz.replace(/_/g, " ")} href="/settings/profile" />
      </InsetGroup>

      {(email?.status === "off" || email?.status === "error" || (digestItem && digestItem.state !== "ok")) && (
        <InsetGroup header="Needs attention">
          {email?.status === "off" && (
            <ListRow icon={<MailWarning />} iconColor="var(--palette-coral)" label="E-mail isn't set up" description="Connect Resend or SMTP so the digest can be sent." href="/settings/connections#email" />
          )}
          {email?.status === "error" && (
            <ListRow icon={<MailWarning />} iconColor="var(--palette-coral)" label="Last test e-mail failed" description={email.check?.error ?? "Check your e-mail settings."} href="/settings/connections#email" />
          )}
          {digestItem && digestItem.state !== "ok" && (
            <ListRow icon={<TriangleAlert />} iconColor="var(--palette-amber)" label="No schedule yet" description="Nothing calls the digest every hour yet." href="/settings/setup" />
          )}
        </InsetGroup>
      )}

      <InsetGroup header="Preview" footer="Previews never mark reminders as sent and don't count as today's digest.">
        <ListRow icon={<ExternalLink />} label="Open today's digest" onClick={() => window.open("/api/settings/digest/preview", "_blank", "noopener")} chevron />
        <ListRow
          icon={sendPreview.isPending ? <Spinner size={18} /> : <Send />}
          label={sendPreview.isPending ? "Sending…" : "E-mail me a preview"}
          description={email && email.status !== "off" ? `To ${profile.email}` : "Set up e-mail first"}
          onClick={onSendPreview}
          disabled={sendPreview.isPending || !email || email.status === "off"}
        />
      </InsetGroup>
    </SectionPage>
  );
}
