"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Users, X } from "lucide-react";
import { Avatar } from "@/components/glass/Avatar";
import { buttonVariants } from "@/components/glass/GlassButton";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { WarmthDot } from "@/components/people/WarmthPicker";
import { spring } from "@/lib/motion";
import { cn, flag } from "@/lib/utils";
import type { ActivityRow } from "@/lib/queries/types";
import type { CityGroup, GlobePerson } from "./globe-data";

export type ActivityLookup = ReadonlyMap<string, Pick<ActivityRow, "id" | "name" | "emoji">>;

type Props = {
  group: CityGroup | null;
  activities: ActivityLookup;
  /** Phone: bottom sheet with detents. Otherwise: floating side panel. */
  phone: boolean;
  onClose: () => void;
  /** Distance from the top of the map to the panel (below the header) on desktop. */
  top: number;
};

export const role = (p: Pick<GlobePerson, "headline" | "company">) => [p.headline, p.company].filter(Boolean).join(" · ");

const peopleLabel = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** Everyone (matching the filters) in one city — sheet on phones, side panel on larger screens. */
export function CityPanel({ group, activities, phone, onClose, top }: Props) {
  const peopleHref = group ? `/people?city=${encodeURIComponent(group.location.id)}` : "/people";

  if (phone) {
    return (
      <Sheet
        open={!!group}
        onOpenChange={(o) => !o && onClose()}
        snapPoints={[0.35, 0.9]}
        title={group ? `${flag(group.location.countryCode)} ${group.location.name}` : undefined}
        description={group ? `${peopleLabel(group.people.length)} · ${group.location.country}` : undefined}
        footer={<OpenInPeople href={peopleHref} />}
        bodyClassName="px-2"
      >
        {group && <PeopleList group={group} activities={activities} />}
      </Sheet>
    );
  }

  return (
    <AnimatePresence>
      {group && (
        <motion.aside
          key="city-panel"
          aria-label={`${group.location.name}: ${peopleLabel(group.people.length)}`}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={spring.smooth}
          style={{ top }}
          className="pointer-events-auto absolute right-3 bottom-[calc(var(--chrome-bottom)+12px)] z-20 flex w-[360px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-xl glass-map specular lg:right-6 lg:bottom-6"
        >
          <div className="flex items-start gap-3 px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-title3 text-fg">
                <span aria-hidden className="mr-1.5">{flag(group.location.countryCode)}</span>
                {group.location.name}
              </h2>
              <p className="text-footnote text-fg-2">
                {peopleLabel(group.people.length)} · {group.location.country}
              </p>
            </div>
            <IconButton label="Close" icon={<X strokeWidth={2.4} />} size="sm" onClick={onClose} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
            <PeopleList key={group.location.id} group={group} activities={activities} />
          </div>
          <div className="border-t-[0.5px] border-separator px-4 py-3">
            <OpenInPeople href={peopleHref} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function OpenInPeople({ href }: { href: string }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "soft", size: "md" }), "w-full")}>
      <Users className="size-[18px]" /> Open in People
    </Link>
  );
}

function PeopleList({ group, activities }: { group: CityGroup; activities: ActivityLookup }) {
  return (
    <ul className="flex flex-col">
      {group.people.map((p) => (
        <li key={p.id}>
          <PersonLine person={p} activities={activities} />
        </li>
      ))}
    </ul>
  );
}

function PersonLine({ person: p, activities }: { person: GlobePerson; activities: ActivityLookup }) {
  const emojis = p.activityIds
    .map((id) => activities.get(id))
    .filter((a): a is NonNullable<typeof a> => !!a?.emoji)
    .slice(0, 3);
  const sub = role(p);
  return (
    <Link
      href={`/people/${p.id}`}
      className="group/row flex min-h-14 items-center gap-3 rounded-md px-3 py-2 outline-none transition-colors duration-150 active:bg-fill-2 focus-visible:bg-fill-1 [@media(hover:hover)]:hover:bg-fill-1"
    >
      <Avatar name={p.displayName} src={p.avatarUrl} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-subhead font-semibold text-fg">{p.displayName}</span>
          {p.warmth === "inner" && <WarmthDot warmth="inner" className="size-2 shrink-0" />}
        </span>
        <span className="block truncate text-footnote text-fg-3">{sub || "—"}</span>
      </span>
      {emojis.length > 0 && (
        <span className="flex shrink-0 gap-0.5 text-subhead" aria-label={emojis.map((a) => a.name).join(", ")}>
          {emojis.map((a) => (
            <span key={a.id} aria-hidden>
              {a.emoji}
            </span>
          ))}
        </span>
      )}
      <ChevronRight size={16} strokeWidth={2.4} className="shrink-0 text-fg-4" aria-hidden />
    </Link>
  );
}
