"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, AtSign, Bell, Cake, Camera, Clock, Globe, Link2, Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { Chip } from "@/components/glass/Chip";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassSheet } from "@/components/glass/GlassSheet";
import { useCreateNote } from "@/lib/queries/notes";
import { useDeletePerson, usePerson } from "@/lib/queries/people";
import type { PersonDetail as PersonDetailT } from "@/lib/queries/types";
import { cn, flag, formatDate, formatRelative, localTimeIn, WARMTH_META } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import { CircleBadge } from "./CirclePicker";
import { HobbyChips } from "./HobbyPicker";
import { EditPersonSheet } from "./PersonSheet";
import { NoteRow } from "@/components/notes/NoteRow";
import { ReminderSheet } from "./ReminderSheet";
import { ReminderRow } from "./ReminderRow";
import { useReminders } from "@/lib/queries/reminders";
import { useSearchParams } from "next/navigation";

export function PersonDetail({ id, initial }: { id: string; initial?: PersonDetailT }) {
  const router = useRouter();
  const { data: p, isPending, error } = usePerson(id);
  const person = p ?? initial;
  const searchParams = useSearchParams();
  const [edit, setEdit] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reminder, setReminder] = useState(() => searchParams.get("reminder") === "1");
  const { data: reminders = [] } = useReminders({ personId: id });
  const del = useDeletePerson();
  const createNote = useCreateNote();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!person) {
    if (isPending) return <div className="glass h-48 animate-pulse rounded-[var(--r-lg)]" />;
    return <GlassCard>{error?.message ?? "Not found"}</GlassCard>;
  }

  const localTime = localTimeIn(person.homeLocation?.timezone);
  const sub = [person.headline, person.company].filter(Boolean).join(" · ");

  const newNote = () =>
    createNote.mutate(
      { personId: person.id, contentMd: "", contentText: "", kind: "note", mentionIds: [], pinned: false },
      { onSuccess: (n) => router.push(`/people/${person.id}/notes/${n.id}`) },
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/people" className="pressable inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-1.5 text-[15px] font-medium text-accent-strong hover:bg-accent-soft">
          <ArrowLeft size={18} /> People
        </Link>
        <div className="flex gap-2">
          <GlassButton size="iconSm" onClick={() => setEdit(true)} aria-label="Edit"><Pencil size={15} /></GlassButton>
          <GlassButton size="iconSm" onClick={() => setMenu(true)} aria-label="More"><MoreHorizontal size={16} /></GlassButton>
        </div>
      </div>

      {/* Header */}
      <GlassCard strong className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/15 blur-3xl" />
        <div className="flex items-start gap-4">
          <Avatar name={person.displayName} src={person.avatarUrl} size={72} className="shadow-lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[26px] font-bold tracking-tight leading-tight">{person.displayName}</h1>
            {sub && <p className="mt-0.5 text-[15px] text-fg-2">{sub}</p>}
            <div className="mt-2 space-y-1 text-[14px] text-fg-2">
              {person.homeLocation && (
                <p className="flex items-center gap-1.5">
                  <MapPin size={14} className="shrink-0 text-accent-strong" />
                  <span className="truncate">
                    {flag(person.homeLocation.countryCode)} {person.homeLocation.name}, {person.homeLocation.country}
                  </span>
                </p>
              )}
              <p className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: WARMTH_META[person.warmth].color }} />
                  {WARMTH_META[person.warmth].label}
                </span>
                {localTime && (
                  <span className="inline-flex items-center gap-1 text-fg-3">
                    <Clock size={13} /> {localTime} their time
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
        {(person.categories.length > 0 || person.circle) && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {person.categories.map((c) => (
              <Chip key={c.id} color={c.color}>
                <CategoryIcon name={c.icon} size={13} />
                {c.name}
              </Chip>
            ))}
            <CircleBadge circle={person.circle} />
          </div>
        )}
        {person.hobbies.length > 0 && (
          <div className="mt-3">
            <HobbyChips hobbies={person.hobbies} other={person.hobbiesOther} size="md" />
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <GlassButton variant="primary" onClick={newNote} disabled={createNote.isPending}>
            <Plus size={18} strokeWidth={2.5} /> Note
          </GlassButton>
          <GlassButton onClick={() => setReminder(true)}>
            <Bell size={17} /> Follow up
          </GlassButton>
          <GlassButton onClick={() => router.push(`/chat?person=${person.id}`)}>
            <Sparkles size={17} /> Ask
          </GlassButton>
        </div>
      </GlassCard>

      {/* How we met */}
      {(person.metContext || person.metAt || person.metLocation || person.introducedBy) && (
        <GlassCard>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-3">How we met</h2>
          {person.metContext && <p className="whitespace-pre-wrap text-[15.5px] leading-relaxed">{person.metContext}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-fg-2">
            {person.metAt && <span>{formatDate(person.metAt)}</span>}
            {person.metLocation && <span>{flag(person.metLocation.countryCode)} {person.metLocation.name}</span>}
            {person.introducedBy && (
              <Link href={`/people/${person.introducedBy.id}`} className="inline-flex items-center gap-1.5 text-accent-strong">
                <Users size={14} /> via {person.introducedBy.displayName}
              </Link>
            )}
          </div>
        </GlassCard>
      )}

      {/* Follow-ups */}
      {reminders.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-fg-3">Follow-ups</h2>
          <GlassCard padded={false} className="p-1.5">
            <ul className="divide-y divide-[var(--glass-border-2)]">
              {reminders.map((r) => (
                <li key={r.id}><ReminderRow r={r} showPerson={false} /></li>
              ))}
            </ul>
          </GlassCard>
        </section>
      )}

      {/* Notes */}
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-fg-3">Notes · {person.notes.length}</h2>
          <button onClick={newNote} className="text-[14px] font-medium text-accent-strong">New note</button>
        </div>
        {person.notes.length === 0 ? (
          <GlassCard interactive onClick={newNote} className="text-center text-fg-2">
            <p className="text-[15px]">No notes yet. Tap to write the first one.</p>
          </GlassCard>
        ) : (
          <GlassCard padded={false} className="p-1.5">
            <ul className="divide-y divide-[var(--glass-border-2)]">
              {person.notes.map((n) => (
                <li key={n.id}><NoteRow note={n} href={`/people/${person.id}/notes/${n.id}`} /></li>
              ))}
            </ul>
          </GlassCard>
        )}
      </section>

      {/* Introduced + mentioned */}
      {(person.introduced.length > 0 || person.mentions.length > 0) && (
        <GlassCard>
          {person.introduced.length > 0 && (
            <>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-3">Introduced me to</h2>
              <div className="flex flex-wrap gap-2">
                {person.introduced.map((q) => (
                  <Link key={q.id} href={`/people/${q.id}`} className="pressable glass flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[14px]">
                    <Avatar name={q.displayName} src={q.avatarUrl} size={26} /> {q.displayName}
                  </Link>
                ))}
              </div>
            </>
          )}
          {person.mentions.length > 0 && (
            <>
              <h2 className={cn("mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-3", person.introduced.length > 0 && "mt-4")}>Mentioned in</h2>
              <ul className="space-y-1">
                {person.mentions.map((m) => (
                  <li key={m.note.id}>
                    <Link href={`/people/${m.note.personId}/notes/${m.note.id}`} className="block truncate text-[14.5px] text-accent-strong">
                      {m.note.title || m.note.contentText.slice(0, 80) || "Untitled"} <span className="text-fg-3">· {formatRelative(m.note.occurredAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </GlassCard>
      )}

      {/* Contact + about */}
      {(person.email || person.phone || person.linkedin || person.xHandle || person.instagram || person.website || person.birthday || person.howICanHelp || person.whatICanAsk) && (
        <GlassCard>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-3">Details</h2>
          <ul className="space-y-1.5 text-[15px]">
            {person.email && <ContactLine icon={Mail} href={`mailto:${person.email}`}>{person.email}</ContactLine>}
            {person.phone && <ContactLine icon={Phone} href={`tel:${person.phone}`}>{person.phone}</ContactLine>}
            {person.linkedin && <ContactLine icon={Link2} href={person.linkedin.startsWith("http") ? person.linkedin : `https://linkedin.com/in/${person.linkedin}`}>{person.linkedin.replace(/^https?:\/\/(www\.)?/, "")}</ContactLine>}
            {person.xHandle && <ContactLine icon={AtSign} href={`https://x.com/${person.xHandle.replace(/^@/, "")}`}>{person.xHandle}</ContactLine>}
            {person.instagram && <ContactLine icon={Camera} href={`https://instagram.com/${person.instagram.replace(/^@/, "")}`}>{person.instagram}</ContactLine>}
            {person.website && <ContactLine icon={Globe} href={person.website.startsWith("http") ? person.website : `https://${person.website}`}>{person.website.replace(/^https?:\/\//, "")}</ContactLine>}
            {person.birthday && <ContactLine icon={Cake}>{formatDate(person.birthday, { year: undefined })}</ContactLine>}
          </ul>
          {person.howICanHelp && <Detail label="How I can help them">{person.howICanHelp}</Detail>}
          {person.whatICanAsk && <Detail label="What I can ask them">{person.whatICanAsk}</Detail>}
        </GlassCard>
      )}

      <p className="px-1 text-center text-[12px] text-fg-4">Added {formatDate(person.createdAt)}{person.sourceKind === "apple-notes" ? " · imported from Apple Notes" : ""}</p>

      <EditPersonSheet person={person} open={edit} onClose={() => setEdit(false)} />
      <ReminderSheet personId={person.id} personName={person.displayName.split(" ")[0] ?? person.displayName} open={reminder} onClose={() => setReminder(false)} />
      <GlassSheet open={menu} onClose={() => setMenu(false)} title={person.displayName} width={420}>
        <div className="space-y-2 pb-2">
          <GlassButton className="w-full justify-start" onClick={() => { setMenu(false); setEdit(true); }}><Pencil size={16} /> Edit details</GlassButton>
          <GlassButton
            variant="danger"
            className="w-full justify-start"
            onClick={() => {
              if (!confirm(`Remove ${person.displayName} from your Network?`)) return;
              del.mutate(person.id, { onSuccess: () => router.replace("/people") });
            }}
          >
            <Trash2 size={16} /> Remove person
          </GlassButton>
        </div>
      </GlassSheet>
    </div>
  );
}

function ContactLine({ icon: Icon, href, children }: { icon: React.ComponentType<{ size?: number; className?: string }>; href?: string; children: React.ReactNode }) {
  const inner = (
    <span className="inline-flex items-center gap-2.5">
      <Icon size={15} className="text-fg-3" />
      <span className="truncate">{children}</span>
    </span>
  );
  return <li>{href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-accent-strong hover:underline">{inner}</a> : inner}</li>;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-[12px] font-medium text-fg-3">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed">{children}</p>
    </div>
  );
}
