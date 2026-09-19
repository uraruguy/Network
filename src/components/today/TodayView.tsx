"use client";
import Link from "next/link";
import { Bell, Globe2, Plus, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { NoteRow } from "@/components/notes/NoteRow";
import { NewPersonSheet } from "@/components/people/PersonSheet";
import { ReminderRow } from "@/components/people/ReminderRow";
import { PageHeader } from "@/components/shell/PageHeader";
import { useRecentNotes } from "@/lib/queries/notes";
import { usePeople } from "@/lib/queries/people";
import { useProfile } from "@/lib/queries/misc";
import { useReminders } from "@/lib/queries/reminders";
import { useNow } from "@/lib/hooks";
import { Capture } from "./Capture";

function greeting(now: number, name?: string | null) {
  const h = new Date(now).getHours();
  const g = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${g}, ${name.split(" ")[0]}` : g;
}

export function TodayView() {
  const { data: profile } = useProfile();
  const now = useNow();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  endOfWeek.setHours(23, 59, 59, 0);
  const { data: reminders = [], isPending: remindersPending } = useReminders({ until: endOfWeek.toISOString().slice(0, 13) + ":00:00.000Z" });
  const { data: notes = [] } = useRecentNotes(6);
  const { data: people = [] } = usePeople();
  const [sheet, setSheet] = useState(false);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const due = reminders.filter((r) => new Date(r.dueAt).getTime() <= endOfToday.getTime());
  const upcoming = reminders.filter((r) => !due.includes(r));
  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(now));

  return (
    <>
      <PageHeader
        title={greeting(now, profile?.displayName)}
        subtitle={dateLabel}
        actions={
          <GlassButton variant="primary" onClick={() => setSheet(true)}>
            <Plus size={18} strokeWidth={2.5} />
            <span className="hidden sm:inline">New person</span>
          </GlassButton>
        }
      />

      <Capture />

      <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat href="/people" icon={Users} label="People" value={people.length} />
        <Stat href="/globe" icon={Globe2} label="Cities" value={new Set(people.map((p) => p.homeLocationId).filter(Boolean)).size} />
        <Stat href="/today" icon={Bell} label="Due today" value={due.length} accent={due.length > 0} />
      </div>

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-fg-3">Follow up</h2>
        {remindersPending ? (
          <div className="glass h-20 animate-pulse rounded-[var(--r-lg)]" />
        ) : due.length === 0 && upcoming.length === 0 ? (
          <GlassCard className="text-center">
            <p className="text-[15px] font-medium">Nothing due this week</p>
            <p className="mt-1 text-[13.5px] text-fg-2">Open a person and tap “Follow up” to plan your next touch.</p>
          </GlassCard>
        ) : (
          <GlassCard padded={false} className="p-1.5">
            {due.length > 0 && (
              <ul className="divide-y divide-[var(--glass-border-2)]">
                {due.map((r) => (
                  <li key={r.id}><ReminderRow r={r} /></li>
                ))}
              </ul>
            )}
            {upcoming.length > 0 && (
              <>
                <p className="px-3 pt-3 pb-1 text-[12px] font-medium uppercase tracking-wide text-fg-4">Later this week</p>
                <ul className="divide-y divide-[var(--glass-border-2)] opacity-80">
                  {upcoming.map((r) => (
                    <li key={r.id}><ReminderRow r={r} /></li>
                  ))}
                </ul>
              </>
            )}
          </GlassCard>
        )}
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-fg-3">Recent notes</h2>
          <Link href="/chat" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong"><Sparkles size={13} /> Ask my network</Link>
        </div>
        {notes.length === 0 ? (
          <GlassCard className="text-center text-[14px] text-fg-2">Notes you write about people show up here.</GlassCard>
        ) : (
          <GlassCard padded={false} className="p-1.5">
            <ul className="divide-y divide-[var(--glass-border-2)]">
              {notes.map((n) => (
                <li key={n.id}><NoteRow note={n} person={n.person} href={`/people/${n.personId}/notes/${n.id}`} /></li>
              ))}
            </ul>
          </GlassCard>
        )}
      </section>

      <NewPersonSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

function Stat({ href, icon: Icon, label, value, accent }: { href: string; icon: React.ComponentType<{ size?: number }>; label: string; value: number; accent?: boolean }) {
  return (
    <Link href={href} className="glass specular pressable flex flex-col gap-2 rounded-[var(--r-lg)] px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
      <span className={accent ? "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-fg sm:h-9 sm:w-9" : "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong sm:h-9 sm:w-9"}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[20px] font-bold leading-none tracking-tight">{value}</span>
        <span className="block truncate text-[12px] text-fg-3">{label}</span>
      </span>
    </Link>
  );
}
