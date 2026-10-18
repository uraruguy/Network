"use client";
import {
  AtSign,
  Bell,
  Briefcase,
  Cake,
  Camera,
  ChevronLeft,
  ClipboardPaste,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Languages,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { Chip } from "@/components/glass/Chip";
import { GlassButton } from "@/components/glass/GlassButton";
import { FollowUpSheet } from "@/components/followups/FollowUpSheet";
import { QuickImportSheet } from "@/components/import/QuickImportSheet";
import { PersonNotesSection } from "@/components/notes/PersonNotesSection";
import { confirm } from "@/components/ui/confirm";
import { AvatarTransition } from "@/components/shell/transitions";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { formatBirthday, parseBirthday } from "@/components/ui/date/BirthdayPicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { useNow } from "@/lib/clock";
import { formatDate, formatRelative, localTimeIn } from "@/lib/format";
import { displayTitle } from "@/lib/notes/title";
import { useCategories, usePersonProfile, usePersonWrites } from "@/lib/queries/people";
import { useCacheReady } from "@/lib/offline/useCacheReady";
import { isTempId } from "@/lib/queries/people-cache";
import { useActivities } from "@/lib/queries/taxonomy";
import type { IndexLocation, PersonDetailApi, PersonIndexRow } from "@/lib/queries/types";
import { cn, flag, WARMTH_META } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import { CircleBadge } from "./CirclePicker";
import { contactLinks, offsetDiffMinutes, offsetLabel, type ContactKind, type ContactLink } from "./contact";
import { EditPersonSheet } from "./PersonSheet";
import { ReminderRow } from "./ReminderRow";
import { WarmthDot } from "./WarmthPicker";

const CONTACT_ICON: Record<ContactKind, ReactNode> = {
  sms: <MessageCircle />,
  call: <Phone />,
  whatsapp: <MessageSquareText />,
  email: <Mail />,
  linkedin: <Link2 />,
  x: <AtSign />,
  instagram: <Camera />,
  website: <Globe />,
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** What the header needs — available from the cached index row before the detail arrives. */
type Head = Pick<PersonIndexRow, "id" | "displayName" | "avatarUrl" | "headline" | "company" | "warmth" | "circle" | "categoryIds"> & { homeLocation: IndexLocation | null };

function openLink(l: Pick<ContactLink, "href" | "external">) {
  if (l.external) window.open(l.href, "_blank", "noopener,noreferrer");
  else window.location.href = l.href;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`, { duration: 2000 });
  } catch {
    toast.error("Couldn’t copy");
  }
}

/** True once `ref` has scrolled under the top bar. */
function useScrolledPast(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(([e]) => setPast(!e!.isIntersecting && e!.boundingClientRect.top < 0), { rootMargin: "-56px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, enabled]);
  return past;
}

/**
 * A person's profile, Apple Contacts-style: big centered avatar and name, round quick actions,
 * then inset-grouped sections. Renders instantly from the cached index row while the full
 * detail loads; every action is optimistic.
 */
export function PersonDetail({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow();
  const writes = usePersonWrites();
  const { person, preview, notFound } = usePersonProfile(id);
  const { data: categories } = useCategories();
  const { data: activities } = useActivities();
  const [editing, setEditing] = useState(false);
  const [followUp, setFollowUp] = useState(() => params.get("reminder") === "1");
  const [importing, setImporting] = useState(false);
  const nameRef = useRef<HTMLHeadingElement>(null);

  // ?reminder=1 (deep link from elsewhere) opens the follow-up sheet once; drop it from the URL.
  const deepLink = params.get("reminder") === "1";
  useEffect(() => {
    if (deepLink) router.replace(`/people/${id}`, { scroll: false });
  }, [deepLink, id, router]);

  // Cached data only once it may render (after hydration and the IndexedDB restore — see
  // useCacheReady): the server never has it, so the first render must match its skeleton. On
  // client navigations this is true immediately, so the hero (and the avatar morph) is there.
  const cacheReady = useCacheReady();
  const head: Head | undefined = cacheReady ? (person ?? preview) : undefined;
  const compact = useScrolledPast(nameRef, !!head);

  const back = () => (window.history.length > 1 ? router.back() : router.push("/people"));

  if (!head) {
    if (cacheReady && notFound) {
      return (
        <div className="mx-auto max-w-2xl">
          <TopBar onBack={back} title="" compact={false} />
          <EmptyState
            icon={<UserRound />}
            title="Not in your Network"
            description="This person was removed, or the link is wrong."
            action={
              <GlassButton variant="soft" onClick={() => router.push("/people")}>
                All people
              </GlassButton>
            }
          />
        </div>
      );
    }
    return <ProfileSkeleton onBack={back} />;
  }

  const name = head.displayName;
  const first = firstName(name);
  const links = person ? contactLinks(person) : [];
  const messageLinks = links.filter((l) => l.kind !== "website");
  const cats = person?.categories ?? (categories ?? []).filter((c) => head.categoryIds.includes(c.id));
  const tz = head.homeLocation?.timezone ?? null;
  const localTime = localTimeIn(tz, now);
  const ahead = offsetLabel(offsetDiffMinutes(tz, now));
  const role = [head.headline, head.company].filter(Boolean).join(" · ");

  const newNote = () => router.push(`/people/${id}/notes/${crypto.randomUUID()}`);

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: "Their notes and follow-ups go with them. You can undo right after.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    writes.remove(id);
    router.replace("/people");
    toast.undo(`${name} removed`, () => {
      writes.restore(id).catch(() => {});
      router.push(`/people/${id}`);
    });
  };

  const moreItems: MenuItem[] = [
    { label: "Edit", icon: <Pencil />, onSelect: () => setEditing(true), shortcut: "E" },
    { label: "Add follow-up", icon: <Bell />, onSelect: () => setFollowUp(true) },
    { label: "Paste from Apple Notes", icon: <ClipboardPaste />, onSelect: () => setImporting(true) },
    "separator",
    { label: "Remove from Network", icon: <Trash2 />, destructive: true, onSelect: () => void remove() },
  ];

  return (
    <div className="mx-auto max-w-2xl pb-6">
      <TopBar
        onBack={back}
        title={name}
        compact={compact}
        right={
          <>
            <GlassButton variant="plain" size="sm" onClick={() => setEditing(true)} disabled={!person}>
              Edit
            </GlassButton>
            <Menu title={name} items={moreItems} trigger={<IconButton label="More" variant="plain" icon={<MoreHorizontal strokeWidth={2.2} />} disabled={!person} />} />
          </>
        }
      />

      {/* Header */}
      <header className="flex flex-col items-center px-2 pt-2 pb-5 text-center">
        {/* Rendered from the cached index row (see `head`), so the list avatar can morph into it. */}
        <AvatarTransition personId={id}>
          <span className="rounded-full elevation-e2">
            <Avatar name={name} src={head.avatarUrl} size={104} />
          </span>
        </AvatarTransition>
        <h1 ref={nameRef} className="mt-3.5 max-w-full text-title1 text-balance text-fg">
          {name}
        </h1>
        {role && <p className="mt-1 max-w-full text-subhead text-balance text-fg-2">{role}</p>}
        {(head.homeLocation || localTime) && (
          <p className="mt-1.5 flex max-w-full flex-wrap items-center justify-center gap-x-1.5 text-footnote text-fg-3">
            {head.homeLocation && (
              <Link href={`/people?city=${head.homeLocation.id}`} className="pressable inline-flex items-center gap-1 rounded-full hover:text-fg-2">
                <span aria-hidden>{flag(head.homeLocation.countryCode)}</span>
                {head.homeLocation.name}
              </Link>
            )}
            {localTime && (
              <>
                {head.homeLocation && <span aria-hidden>·</span>}
                <span className="tabular-nums" suppressHydrationWarning>
                  {localTime}
                  {ahead ? ` · ${ahead}` : ""}
                </span>
              </>
            )}
          </p>
        )}
        <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-1.5">
          <Chip size="sm">
            <WarmthDot warmth={head.warmth} className="size-2" />
            {WARMTH_META[head.warmth].label}
          </Chip>
          {cats.map((c) => (
            <Link key={c.id} href={`/people?cat=${c.id}`} className="pressable rounded-full">
              <Chip size="sm" color={c.color}>
                <CategoryIcon name={c.icon} size={12} aria-hidden />
                {c.name}
              </Chip>
            </Link>
          ))}
          <CircleBadge circle={head.circle} />
        </div>
      </header>

      {/* Quick actions */}
      <div className="mb-7 grid grid-cols-4 gap-2 px-1 sm:px-6">
        <QuickAction icon={<NotebookPen />} label="Note" onClick={newNote} />
        <QuickAction icon={<Bell />} label="Follow up" onClick={() => setFollowUp(true)} disabled={!person} />
        {messageLinks.length ? (
          <Menu
            title={`Reach ${first}`}
            align="center"
            items={messageLinks.map((l) => ({ label: `${l.label} · ${l.value}`, icon: CONTACT_ICON[l.kind], onSelect: () => openLink(l) }))}
            trigger={<QuickAction icon={<MessageCircle />} label="Message" />}
          />
        ) : (
          <QuickAction icon={<MessageCircle />} label="Message" disabled title={person ? "Add a phone, email or handle to reach them" : undefined} />
        )}
        <QuickAction icon={<Sparkles />} label="Ask" onClick={() => router.push(`/chat?person=${id}`)} />
      </div>

      {!person ? (
        <div className="surface overflow-hidden rounded-lg">
          <SkeletonRows count={4} avatar={false} />
        </div>
      ) : (
        <div className="space-y-7">
          <FollowUpsSection person={person} onAdd={() => setFollowUp(true)} />

          <div className="space-y-3">
            <PersonNotesSection personId={id} personName={name} />
            <InsetGroup>
              <ListRow icon={<ClipboardPaste />} label="Paste from Apple Notes" description={`AI files it as notes on ${first}`} onClick={() => setImporting(true)} chevron />
            </InsetGroup>
          </div>

          <ActivitiesSection person={person} activities={activities} onEdit={() => setEditing(true)} />
          <TagsSection person={person} onEdit={() => setEditing(true)} />
          <HowWeMet person={person} />
          <Connections person={person} />
          <Mentions person={person} />
          <Details person={person} links={links} now={now} />

          <p className="px-4 pt-1 text-center text-caption text-fg-4">
            Added {formatDate(person.createdAt)}
            {person.lastInteractionAt ? ` · last in touch ${formatRelative(person.lastInteractionAt, now)}` : ""}
            {person.sourceKind === "apple-notes" ? " · from Apple Notes" : ""}
          </p>
        </div>
      )}

      {person && <EditPersonSheet person={person} open={editing} onClose={() => setEditing(false)} />}
      <FollowUpSheet open={followUp} onOpenChange={setFollowUp} personId={id} personName={name} />
      <QuickImportSheet open={importing} onOpenChange={setImporting} personId={id} personName={name} />
      <EditShortcut onEdit={() => person && setEditing(true)} />
    </div>
  );
}

/** "E" opens Edit (desktop), when nothing else has focus. */
function EditShortcut({ onEdit }: { onEdit: () => void }) {
  const cb = useRef(onEdit);
  useEffect(() => {
    cb.current = onEdit;
  }, [onEdit]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "e" || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const t = (document.activeElement ?? e.target) as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest("[role=dialog],[role=menu],[role=listbox]"))) return;
      e.preventDefault();
      cb.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

/* ------------------------------------------------------------------ */
/*  Chrome                                                             */
/* ------------------------------------------------------------------ */

function TopBar({ onBack, title, compact, right }: { onBack: () => void; title: string; compact: boolean; right?: ReactNode }) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-4 -mt-[calc(12px+var(--sat))] mb-1 px-2 pt-[var(--sat)] transition-[background-color,box-shadow,backdrop-filter] duration-200 sm:-mx-6 sm:px-4 lg:-mx-10 lg:-mt-8 lg:px-8 lg:pt-0",
        compact ? "glass border-b-[0.5px] border-separator" : "bg-transparent",
      )}
    >
      <div className="grid h-13 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="justify-self-start">
          <button
            type="button"
            onClick={onBack}
            className="pressable -ml-1 inline-flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1 text-body text-accent-text hover:bg-accent-soft"
          >
            <ChevronLeft size={24} strokeWidth={2.4} aria-hidden />
            People
          </button>
        </div>
        <span
          aria-hidden={!compact}
          className={cn(
            "max-w-[52vw] truncate text-headline text-fg transition-[opacity,transform] duration-200 motion-reduce:transition-none sm:max-w-[320px]",
            compact ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
        >
          {title}
        </span>
        <div className="flex items-center gap-0.5 justify-self-end">{right}</div>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick, disabled, title, ...rest }: { icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="pressable group/qa flex min-w-0 flex-col items-center gap-1.5 rounded-md py-1 outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
      {...rest}
    >
      <span className="glass specular grid size-[52px] place-items-center rounded-full text-accent-text transition-colors duration-150 group-hover/qa:bg-accent-soft [&_svg]:size-[22px]" aria-hidden>
        {icon}
      </span>
      <span className="max-w-full truncate text-caption font-medium text-accent-text">{label}</span>
    </button>
  );
}

function ProfileSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-2xl" role="status" aria-label="Loading">
      <TopBar onBack={onBack} title="" compact={false} />
      <div className="flex flex-col items-center pt-2 pb-5">
        <Skeleton className="size-[104px] rounded-full" />
        <Skeleton className="mt-4 h-7 w-48 rounded-full" />
        <Skeleton className="mt-2.5 h-4 w-36 rounded-full" />
        <Skeleton className="mt-2 h-3.5 w-28 rounded-full" />
      </div>
      <div className="mb-7 grid grid-cols-4 gap-2 px-1 sm:px-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 py-1">
            <Skeleton className="size-[52px] rounded-full" />
            <Skeleton className="h-3 w-12 rounded-full" />
          </div>
        ))}
      </div>
      <div className="surface overflow-hidden rounded-lg">
        <SkeletonRows count={4} avatar={false} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

function FollowUpsSection({ person, onAdd }: { person: PersonDetailApi; onAdd: () => void }) {
  const reminders = person.reminders ?? [];
  return (
    <InsetGroup
      header={reminders.length > 1 ? "Follow-ups" : "Next follow-up"}
      headerAction={
        reminders.length > 0 ? (
          <button type="button" onClick={onAdd} className="hit-44 relative inline-flex items-center gap-1 font-medium text-accent-text">
            <Plus size={14} strokeWidth={2.6} aria-hidden />
            Add
          </button>
        ) : undefined
      }
    >
      {reminders.length ? (
        reminders.map((r) => <ReminderRow key={r.id} r={r} showPerson={false} personName={person.displayName} className="border-b-[0.5px] border-separator last:border-b-0" />)
      ) : (
        <ListRow icon={<Bell />} label="Set a follow-up" description={`Get a nudge to reach out to ${firstName(person.displayName)}`} onClick={onAdd} chevron />
      )}
    </InsetGroup>
  );
}

function ActivitiesSection({ person, activities, onEdit }: { person: PersonDetailApi; activities?: { id: string; name: string; emoji: string | null }[]; onEdit: () => void }) {
  const byId = useMemo(() => new Map((activities ?? []).map((a) => [a.id, a])), [activities]);
  const list = person.activityIds.map((aid) => byId.get(aid)).filter((a): a is NonNullable<typeof a> => !!a);
  if (!list.length) return null;
  return (
    <InsetGroup header="Do together" headerAction={<EditLink onClick={onEdit} />}>
      <div className="flex flex-wrap gap-2 p-3">
        {list.map((a) => (
          <Link key={a.id} href={`/people?act=${a.id}`} className="pressable rounded-full">
            <Chip>
              {a.emoji && (
                <span aria-hidden className="text-subhead leading-none">
                  {a.emoji}
                </span>
              )}
              {a.name}
            </Chip>
          </Link>
        ))}
      </div>
    </InsetGroup>
  );
}

function TagsSection({ person, onEdit }: { person: PersonDetailApi; onEdit: () => void }) {
  if (!person.tags?.length) return null;
  return (
    <InsetGroup header="Who they are" headerAction={<EditLink onClick={onEdit} />}>
      <div className="flex flex-wrap gap-2 p-3">
        {person.tags.map((t) =>
          isTempId(t.id) ? (
            <Chip key={t.id} color={t.color ?? undefined}>
              {t.name}
            </Chip>
          ) : (
            <Link key={t.id} href={`/people?tag=${t.id}`} className="pressable rounded-full">
              <Chip color={t.color ?? undefined}>{t.name}</Chip>
            </Link>
          ),
        )}
      </div>
    </InsetGroup>
  );
}

function EditLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="hit-44 relative font-medium text-accent-text">
      Edit
    </button>
  );
}

function HowWeMet({ person }: { person: PersonDetailApi }) {
  const { metContext, metAt, metLocation, introducedBy } = person;
  if (!metContext && !metAt && !metLocation && !introducedBy) return null;
  return (
    <InsetGroup header="How we met">
      {metContext && (
        <div className="relative px-4 py-3 after:absolute after:right-0 after:bottom-0 after:left-4 after:h-[0.5px] after:bg-separator last:after:hidden">
          <p className="text-body whitespace-pre-wrap text-fg select-text">{metContext}</p>
        </div>
      )}
      {metAt && <ListRow label="Met on" value={formatDate(metAt)} />}
      {metLocation && (
        <ListRow
          label="Met in"
          value={
            <>
              <span aria-hidden>{flag(metLocation.countryCode)} </span>
              {metLocation.name}
            </>
          }
        />
      )}
      {introducedBy && (
        <ListRow
          leading={<Avatar name={introducedBy.displayName} src={introducedBy.avatarUrl} size={30} />}
          label={introducedBy.displayName}
          description="Introduced you"
          href={`/people/${introducedBy.id}`}
        />
      )}
    </InsetGroup>
  );
}

function Connections({ person }: { person: PersonDetailApi }) {
  if (!person.introduced?.length) return null;
  return (
    <InsetGroup header="Connections" footer={`People ${firstName(person.displayName)} introduced you to.`}>
      {person.introduced.map((p) => (
        <ListRow key={p.id} leading={<Avatar name={p.displayName} src={p.avatarUrl} size={30} />} label={p.displayName} description={p.headline ?? undefined} href={`/people/${p.id}`} />
      ))}
    </InsetGroup>
  );
}

function Mentions({ person }: { person: PersonDetailApi }) {
  const now = useNow();
  if (!person.mentions?.length) return null;
  return (
    <InsetGroup header="Mentioned in">
      {person.mentions.map(({ note }) => (
        <ListRow
          key={note.id}
          icon={<FileText />}
          label={displayTitle(note)}
          description={`${note.personName}’s note · ${formatRelative(note.occurredAt, now)}`}
          href={`/people/${note.personId}/notes/${note.id}`}
        />
      ))}
    </InsetGroup>
  );
}

function birthdayNote(birthday: string, now: number): string | null {
  const b = parseBirthday(birthday);
  if (!b) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), b.month - 1, b.day);
  if (next < today) next = new Date(today.getFullYear() + 1, b.month - 1, b.day);
  const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  const turns = b.year ? next.getFullYear() - b.year : null;
  if (days === 0) return turns ? `Today · turns ${turns}` : "Today";
  if (days <= 30) return `In ${days} day${days === 1 ? "" : "s"}${turns ? ` · turns ${turns}` : ""}`;
  return turns ? `${turns - 1} years old` : null;
}

function Details({ person, links, now }: { person: PersonDetailApi; links: ContactLink[]; now: number }) {
  const rows: ReactNode[] = [];
  for (const l of links) {
    if (l.kind === "sms" || l.kind === "whatsapp") continue; // phone appears once, as "Phone"
    const label = l.kind === "call" ? "Phone" : l.label;
    rows.push(
      <DetailRow
        key={l.kind}
        label={label}
        value={l.value}
        icon={CONTACT_ICON[l.kind]}
        href={l.href}
        external={l.external}
        menu={[
          { label: `Copy ${label.toLowerCase()}`, icon: <Copy />, onSelect: () => void copy(l.value, label) },
          { label: l.kind === "call" ? "Call" : l.kind === "email" ? "Send email" : "Open", icon: <ExternalLink />, onSelect: () => openLink(l) },
        ]}
      />,
    );
  }
  if (person.birthday) {
    const note = birthdayNote(String(person.birthday), now);
    const text = formatBirthday(String(person.birthday));
    rows.push(<DetailRow key="birthday" label="Birthday" value={text} note={note} icon={<Cake />} menu={[{ label: "Copy birthday", icon: <Copy />, onSelect: () => void copy(text, "Birthday") }]} />);
  }
  if (person.languages?.length) {
    const text = person.languages.join(", ");
    rows.push(<DetailRow key="languages" label="Languages" value={text} icon={<Languages />} menu={[{ label: "Copy", icon: <Copy />, onSelect: () => void copy(text, "Languages") }]} />);
  }
  if (person.interests?.length) {
    const text = person.interests.join(", ");
    rows.push(<DetailRow key="interests" label="Interests" value={text} icon={<Sparkles />} menu={[{ label: "Copy", icon: <Copy />, onSelect: () => void copy(text, "Interests") }]} />);
  }
  if (person.howICanHelp)
    rows.push(<DetailRow key="help" label="How I can help them" value={person.howICanHelp} icon={<Users />} multiline menu={[{ label: "Copy", icon: <Copy />, onSelect: () => void copy(person.howICanHelp!, "Text") }]} />);
  if (person.whatICanAsk)
    rows.push(<DetailRow key="ask" label="What I can ask them" value={person.whatICanAsk} icon={<Briefcase />} multiline menu={[{ label: "Copy", icon: <Copy />, onSelect: () => void copy(person.whatICanAsk!, "Text") }]} />);
  if (person.homeLocation)
    rows.push(
      <DetailRow
        key="home"
        label="Lives in"
        value={[person.homeLocation.name, person.homeLocation.admin !== person.homeLocation.name ? person.homeLocation.admin : null, person.homeLocation.country].filter(Boolean).join(", ")}
        icon={<MapPin />}
        menu={[{ label: "Copy", icon: <Copy />, onSelect: () => void copy(person.homeLocation!.name, "City") }]}
      />,
    );
  if (!rows.length) return null;
  return <InsetGroup header="Details">{rows}</InsetGroup>;
}

function DetailRow({
  label,
  value,
  note,
  icon,
  href,
  external,
  multiline,
  menu,
}: {
  label: string;
  value: string;
  note?: string | null;
  icon: ReactNode;
  href?: string;
  external?: boolean;
  multiline?: boolean;
  menu: MenuItem[];
}) {
  const body = (
    <>
      <span className="grid size-[30px] shrink-0 place-items-center text-fg-3 [&_svg]:size-[18px]" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 py-2.5">
        <span className="block text-footnote text-fg-3">{label}</span>
        <span className={cn("block text-body select-text", href ? "text-accent-text" : "text-fg", multiline ? "whitespace-pre-wrap" : "truncate")}>{value}</span>
        {note && <span className="mt-0.5 block text-footnote font-medium text-accent-text">{note}</span>}
      </span>
    </>
  );
  const cls =
    "relative flex min-h-14 w-full items-center gap-3 px-4 text-left outline-none after:absolute after:right-0 after:bottom-0 after:left-[58px] after:h-[0.5px] after:bg-separator";
  return (
    <ContextMenu items={menu} title={label} className="block [&:last-child>*]:after:hidden">
      {href ? (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className={cn(cls, "transition-colors duration-150 active:bg-fill-2 focus-visible:bg-fill-1 [@media(hover:hover)]:hover:bg-fill-1")}
        >
          {body}
        </a>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </ContextMenu>
  );
}
