"use client";
import { Plus, Search, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { Chip } from "@/components/glass/Chip";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { WARMTH, type Warmth } from "@/lib/db/schema";
import { useCategories, usePeople } from "@/lib/queries/people";
import { WARMTH_META } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import { PersonRow } from "./PersonRow";
import { NewPersonSheet } from "./PersonSheet";

export function PeopleList() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [category, setCategory] = useState<string | undefined>();
  const [warmth, setWarmth] = useState<Warmth | undefined>();
  const [sheet, setSheet] = useState(() => params.get("new") === "1");
  const { data: cats = [] } = useCategories();
  const { data: people = [], isPending, isFetching } = usePeople({ q: dq || undefined, category, warmth });

  useEffect(() => {
    if (params.get("new")) router.replace("/people");
  }, [params, router]);

  const filtered = !!(dq || category || warmth);

  return (
    <>
      <PageHeader
        title="People"
        subtitle={people.length ? `${people.length} ${filtered ? "matching" : "in your network"}` : undefined}
        actions={
          <GlassButton variant="primary" onClick={() => setSheet(true)}>
            <Plus size={18} strokeWidth={2.5} />
            <span className="hidden sm:inline">New person</span>
          </GlassButton>
        }
      />

      <div className="glass specular flex h-12 items-center gap-2.5 rounded-full px-4">
        <Search size={18} className="text-fg-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, role, company…"
          className="h-full w-full bg-transparent text-[16px] outline-none placeholder:text-fg-4"
          type="search"
          autoComplete="off"
        />
        {isFetching && !isPending && <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />}
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {cats.map((c) => (
          <button key={c.id} className="pressable shrink-0" onClick={() => setCategory(category === c.id ? undefined : c.id)}>
            <Chip color={c.color} active={category === c.id}>
              <CategoryIcon name={c.icon} size={13} />
              {c.name}
            </Chip>
          </button>
        ))}
        <span className="mx-1 w-px shrink-0 bg-fg/10" />
        {WARMTH.map((w) => (
          <button key={w} className="pressable shrink-0" onClick={() => setWarmth(warmth === w ? undefined : w)}>
            <Chip active={warmth === w}>
              <span className="h-2 w-2 rounded-full" style={{ background: WARMTH_META[w].color }} />
              {WARMTH_META[w].label}
            </Chip>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass h-[72px] animate-pulse rounded-[18px]" />
            ))}
          </div>
        ) : people.length === 0 ? (
          <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent-strong">
              <UserPlus size={26} />
            </div>
            <div>
              <p className="text-[17px] font-semibold">{filtered ? "No one matches" : "Your network starts here"}</p>
              <p className="mt-1 text-[14px] text-fg-2">{filtered ? "Try a different search or filter." : "Add the first person you want to remember."}</p>
            </div>
            {!filtered && (
              <GlassButton variant="primary" onClick={() => setSheet(true)}>
                <Plus size={18} strokeWidth={2.5} /> Add a person
              </GlassButton>
            )}
          </GlassCard>
        ) : (
          <GlassCard padded={false} className="p-1.5">
            <ul className="divide-y divide-[var(--glass-border-2)]">
              {people.map((p) => (
                <li key={p.id}>
                  <PersonRow p={p} />
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </div>

      <NewPersonSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}
