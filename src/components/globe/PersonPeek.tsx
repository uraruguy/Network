"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { BellPlus, MapPin, X } from "lucide-react";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { Chip } from "@/components/glass/Chip";
import { buttonVariants } from "@/components/glass/GlassButton";
import { IconButton } from "@/components/ui/IconButton";
import { spring } from "@/lib/motion";
import { cn, flag } from "@/lib/utils";
import { role, type ActivityLookup } from "./CityPanel";
import type { CityGroup } from "./globe-data";

type Props = {
  /** A city with exactly one (filtered) person, or null. */
  group: CityGroup | null;
  activities: ActivityLookup;
  onClose: () => void;
  /** Desktop: distance from the top of the map (below the header). */
  top: number;
};

/** Mini card for a one-person city: who, what they do, what you do together, and the next step. */
export function PersonPeek({ group, activities, onClose, top }: Props) {
  const person = group?.people[0] ?? null;
  return (
    <AnimatePresence>
      {group && person && (
        <motion.section
          key={person.id}
          aria-label={person.displayName}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={spring.smooth}
          style={{ "--peek-top": `${top}px` } as CSSProperties}
          className={cn(
            "pointer-events-auto absolute inset-x-3 bottom-[calc(var(--chrome-bottom)+12px)] z-20 mx-auto max-w-[400px] rounded-xl glass-map specular p-4",
            "sm:inset-x-auto sm:right-4 sm:bottom-auto sm:top-[var(--peek-top)] sm:w-[340px] lg:right-6",
          )}
        >
          <div className="flex items-start gap-3">
            <Avatar name={person.displayName} src={person.avatarUrl} size={52} />
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="truncate text-headline text-fg">{person.displayName}</h2>
              {role(person) && <p className="truncate text-footnote text-fg-2">{role(person)}</p>}
              <p className="mt-0.5 flex items-center gap-1 truncate text-footnote text-fg-3">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {group.location.name}, {group.location.country} <span aria-hidden>{flag(group.location.countryCode)}</span>
                </span>
              </p>
            </div>
            <IconButton label="Close" icon={<X strokeWidth={2.4} />} size="sm" onClick={onClose} className="-mt-1 -mr-1" />
          </div>
          <ActivityChips ids={person.activityIds} activities={activities} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href={`/people/${person.id}`} className={buttonVariants({ variant: "primary", size: "md" })}>
              Open
            </Link>
            <Link href={`/people/${person.id}?reminder=1`} className={buttonVariants({ variant: "soft", size: "md" })}>
              <BellPlus className="size-[18px]" /> Follow up
            </Link>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function ActivityChips({ ids, activities }: { ids: string[]; activities: ActivityLookup }) {
  const list = ids.map((id) => activities.get(id)).filter((a): a is NonNullable<typeof a> => !!a);
  if (!list.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {list.slice(0, 4).map((a) => (
        <Chip key={a.id} size="sm">
          {a.emoji && <span aria-hidden>{a.emoji}</span>}
          {a.name}
        </Chip>
      ))}
      {list.length > 4 && <Chip size="sm">+{list.length - 4}</Chip>}
    </div>
  );
}
