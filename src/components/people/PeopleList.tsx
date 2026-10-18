"use client";
import { Globe2, Plus, SearchX, UserPlus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { buttonVariants, GlassButton } from "@/components/glass/GlassButton";
import { FilterBar } from "@/components/filters/FilterBar";
import { FollowUpSheet } from "@/components/followups/FollowUpSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { activeFacetCount, hrefWithFilters, type PeopleRow } from "@/lib/filters/people-filters";
import { indexLetter } from "@/lib/filters/sort";
import { replaceSearchParams, usePeopleFilters, usePeopleSort } from "@/lib/filters/usePeopleFilters";
import { NOTE_SEARCH_MIN, usePeopleList, usePeopleNoteSearch } from "@/lib/queries/people-index";
import { useActivities } from "@/lib/queries/taxonomy";
import type { NoteSearchHit } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { DuplicateSuggestions } from "./DuplicateSuggestions";
import { PeopleVirtualList, type PeopleVirtualListHandle } from "./PeopleVirtualList";
import { compactAgo, PERSON_ROW_HEIGHT } from "./PersonRow";
import { NewPersonSheet } from "./PersonSheet";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/**
 * People: large title + counts, sticky search and facet pills (URL-synced), a virtualized list of
 * everyone matching, and — while searching — matching notes underneath.
 */
export function PeopleList() {
  const params = useSearchParams();
  const { filters, setFilters, clear } = usePeopleFilters();
  const [sort, setSort] = usePeopleSort();
  const list = usePeopleList(filters, sort);
  const { data: activities } = useActivities();
  const emojiById = useMemo(() => new Map((activities ?? []).flatMap((a) => (a.emoji ? [[a.id, a.emoji] as const] : []))), [activities]);
  const peopleById = useMemo(() => new Map(list.all.map((p) => [p.id, p])), [list.all]);

  // `?new=1` (from the tab bar / Today) opens the new-person sheet once, then leaves the URL.
  const wantsNew = params.get("new") === "1";
  const [newOpen, setNewOpen] = useState(wantsNew);
  const [sawNew, setSawNew] = useState(wantsNew);
  if (wantsNew !== sawNew) {
    setSawNew(wantsNew);
    if (wantsNew) setNewOpen(true);
  }
  useEffect(() => {
    if (wantsNew) replaceSearchParams((p) => p.delete("new"));
  }, [wantsNew]);

  const [followUp, setFollowUp] = useState<{ open: boolean; person: PeopleRow | null }>({ open: false, person: null });
  const openFollowUp = useCallback((person: PeopleRow) => setFollowUp({ open: true, person }), []);

  // "/" focuses the search field (desktop habit).
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const listHandle = useRef<PeopleVirtualListHandle>(null);
  const total = list.all.length;
  const shown = list.rows.length;
  const searching = filters.q.trim().length >= NOTE_SEARCH_MIN;
  const alphaIndex = sort === "name" && !filters.q.trim() && shown > 40;
  const summary = list.isPending ? null : list.filtered ? `${shown.toLocaleString("en")} of ${plural(total, "person", "people")}` : plural(total, "person", "people");

  return (
    <>
      <header className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-large-title text-fg">People</h1>
          <p className="mt-0.5 min-h-5 text-subhead text-fg-2 tabular-nums" aria-live="polite">
            {summary && (
              <>
                {summary}
                {list.cityCount > 0 && <span className="text-fg-3"> · {plural(list.cityCount, "city", "cities")}</span>}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-1">
          <Link
            href={hrefWithFilters("/globe", filters)}
            aria-label="Show on globe"
            title="Show these people on the globe"
            className={cn(buttonVariants({ variant: "glass", size: "md" }), "max-sm:w-11 max-sm:px-0")}
          >
            <Globe2 size={18} strokeWidth={2.2} aria-hidden />
            <span className="max-sm:hidden">Show on globe</span>
          </Link>
          <GlassButton variant="primary" onClick={() => setNewOpen(true)} aria-label="New person" className="max-sm:w-11 max-sm:px-0">
            <Plus size={18} strokeWidth={2.6} aria-hidden />
            <span className="max-sm:hidden">New person</span>
          </GlassButton>
        </div>
      </header>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        people={list.all}
        sort={sort}
        onSortChange={setSort}
        searchRef={searchRef}
        searchPlaceholder="Search name, role, company, city"
      />

      <div className="mt-2">
        {list.isPending ? (
          <ListSkeleton />
        ) : list.isError && total === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title="Couldn’t load your people"
            description="Check your connection and try again."
            action={
              <GlassButton variant="soft" onClick={() => list.refetch()}>
                Try again
              </GlassButton>
            }
          />
        ) : total === 0 ? (
          <EmptyState
            icon={<UserPlus />}
            title="Your network starts here"
            description="Add the first person you want to remember."
            action={
              <GlassButton variant="primary" onClick={() => setNewOpen(true)}>
                <Plus size={18} strokeWidth={2.6} aria-hidden /> Add a person
              </GlassButton>
            }
          />
        ) : shown === 0 ? (
          <EmptyState
            compact={searching}
            icon={<SearchX />}
            title={filters.q.trim() ? `No one matches “${filters.q.trim()}”` : "No one matches these filters"}
            description={activeFacetCount(filters) > 0 ? "Try removing a filter." : "Try a different spelling, or search notes below."}
            action={
              <GlassButton variant="soft" onClick={() => clear({ keepQuery: activeFacetCount(filters) > 0 })}>
                Clear {activeFacetCount(filters) > 0 ? "filters" : "search"}
              </GlassButton>
            }
          />
        ) : (
          <>
            {/* Always mounted, so the virtual list re-measures its offset when suggestions come and go. */}
            <div>{!list.filtered && <DuplicateSuggestions people={list.all} />}</div>
            <PeopleVirtualList
              people={list.rows}
              emojiById={emojiById}
              detail={sort === "followup" ? "followup" : "last"}
              onFollowUp={openFollowUp}
              stale={list.isStale}
              handleRef={listHandle}
              // Room for the A–Z index along the right edge.
              className={alphaIndex ? "max-lg:mr-3.5" : undefined}
            />
            {alphaIndex && <AlphaIndex rows={list.rows} onJump={(i) => listHandle.current?.scrollToIndex(i)} />}
          </>
        )}
      </div>

      {searching && <NoteHits query={filters.q} peopleById={peopleById} />}

      <NewPersonSheet open={newOpen} onClose={() => setNewOpen(false)} />
      <FollowUpSheet
        open={followUp.open}
        onOpenChange={(open) => setFollowUp((f) => ({ ...f, open }))}
        personId={followUp.person?.id ?? ""}
        personName={followUp.person?.displayName ?? ""}
      />
    </>
  );
}

/* ---------- loading ---------- */

function ListSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading people" className="surface ui-skeleton-reveal overflow-hidden rounded-lg">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4" style={{ height: PERSON_ROW_HEIGHT }}>
          <Skeleton reveal={false} className="size-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton reveal={false} className="h-3.5 rounded-full" style={{ width: `${38 + ((i * 17) % 30)}%` }} />
            <Skeleton reveal={false} className="h-3 rounded-full" style={{ width: `${46 + ((i * 23) % 34)}%` }} />
          </div>
          <Skeleton reveal={false} className="h-3 w-8 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ---------- "In notes" ---------- */

const NOTES_COLLAPSED = 5;

function NoteHits({ query, peopleById }: { query: string; peopleById: ReadonlyMap<string, PeopleRow> }) {
  const search = usePeopleNoteSearch(query);
  const [expanded, setExpanded] = useState(false);
  const hits = search.hits;
  const shown = expanded ? hits : hits.slice(0, NOTES_COLLAPSED);
  const loadingFirst = search.isUpdating && hits.length === 0;

  return (
    <section aria-labelledby="people-note-hits" className="mt-7 space-y-1.5">
      <div className="flex min-h-5 items-center justify-between gap-3 px-4">
        <h2 id="people-note-hits" className="text-footnote font-medium tracking-[0.02em] text-fg-3 uppercase">
          In notes
        </h2>
        {search.isUpdating && <Spinner size={14} className="text-fg-3" />}
      </div>
      {loadingFirst ? (
        <div className="surface overflow-hidden rounded-lg">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <Skeleton className="h-3.5 w-2/5 rounded-full" />
              <Skeleton className="h-3 w-4/5 rounded-full" />
            </div>
          ))}
        </div>
      ) : search.isError && hits.length === 0 ? (
        <p className="px-4 text-subhead text-fg-3">Note search is unavailable offline.</p>
      ) : hits.length === 0 ? (
        !search.isUpdating && <p className="px-4 text-subhead text-fg-3">No notes mention “{search.query}”.</p>
      ) : (
        <>
          <ul className={cn("surface overflow-hidden rounded-lg transition-opacity duration-200", search.isUpdating && "opacity-70")}>
            {shown.map((hit) => (
              <li key={hit.id} className="group/item">
                <NoteHitRow hit={hit} avatarUrl={peopleById.get(hit.personId)?.avatarUrl ?? null} />
              </li>
            ))}
          </ul>
          {hits.length > NOTES_COLLAPSED && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="pressable hit-44 ml-2 h-8 rounded-full px-2 text-footnote font-medium text-accent-text hover:bg-accent-soft"
            >
              {expanded ? "Show fewer" : `Show all ${hits.length} notes`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function NoteHitRow({ hit, avatarUrl }: { hit: NoteSearchHit; avatarUrl: string | null }) {
  return (
    <Link
      href={`/people/${hit.personId}/notes/${hit.id}`}
      transitionTypes={["nav-forward"]}
      className={cn(
        "relative flex gap-3 px-4 py-3 outline-none transition-colors duration-150 active:bg-fill-2 focus-visible:bg-fill-1 [@media(hover:hover)]:hover:bg-fill-1",
        "after:absolute after:right-0 after:bottom-0 after:left-[60px] after:h-[0.5px] after:bg-separator group-last/item:after:hidden",
      )}
    >
      <Avatar name={hit.personName} src={avatarUrl} size={32} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-subhead">
            <span className="font-semibold text-fg">{hit.personName}</span>
            {hit.title && <span className="text-fg-2"> · {hit.title}</span>}
          </span>
          <RelativeTime date={hit.occurredAt} format={compactAgo} className="shrink-0 text-footnote text-fg-3 tabular-nums" />
        </span>
        <span className="mt-0.5 line-clamp-2 text-footnote text-fg-2">
          <Highlighted text={hit.snippet} />
        </span>
      </span>
    </Link>
  );
}

/** Renders `**match**` fragments from the search snippet as <mark>. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-accent-soft font-semibold text-fg [box-decoration-break:clone]">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/* ---------- A–Z index (phones, name sort) ---------- */

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

function AlphaIndex({ rows, onJump }: { rows: readonly PeopleRow[]; onJump: (index: number) => void }) {
  const firstIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((p, i) => {
      const l = indexLetter(p.displayName);
      if (!m.has(l)) m.set(l, i);
    });
    return m;
  }, [rows]);
  const [active, setActive] = useState<string | null>(null);
  const last = useRef<string | null>(null);

  const jumpAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.min(LETTERS.length - 1, Math.max(0, Math.floor(((e.clientY - box.top) / box.height) * LETTERS.length)));
    const letter = LETTERS[i]!;
    if (letter === last.current) return;
    last.current = letter;
    setActive(letter);
    // Letters without people jump to the next one that has some.
    const target = LETTERS.slice(i).find((l) => firstIndex.has(l)) ?? [...LETTERS.slice(0, i)].reverse().find((l) => firstIndex.has(l));
    if (target) onJump(firstIndex.get(target)!);
  };
  const end = () => {
    last.current = null;
    setActive(null);
  };

  return (
    <>
      <div
        aria-hidden
        className="fixed top-1/2 right-0.5 z-20 flex -translate-y-1/2 touch-none flex-col items-center py-1 select-none lg:hidden"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          jumpAt(e);
        }}
        onPointerMove={(e) => e.buttons > 0 && jumpAt(e)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {LETTERS.map((l) => (
          <span key={l} className={cn("grid h-3.5 w-6 place-items-center text-caption2 font-semibold", firstIndex.has(l) ? "text-accent-text" : "text-fg-4")}>
            {l}
          </span>
        ))}
      </div>
      {active && (
        <div aria-hidden className="glass-thick pointer-events-none fixed top-1/2 left-1/2 z-40 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg text-large-title text-fg lg:hidden">
          {active}
        </div>
      )}
    </>
  );
}
