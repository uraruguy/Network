"use client";
import { useRouter } from "next/navigation";
import { Check, Download, LogOut, Moon, Plus, Sun, SunMoon, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useTheme } from "@/lib/hooks";
import Link from "next/link";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { Field, GlassInput } from "@/components/glass/GlassInput";
import { Chip } from "@/components/glass/Chip";
import { CategoryIcon, CATEGORY_ICON_NAMES } from "@/components/people/CategoryIcon";
import { CityPicker } from "@/components/people/CityPicker";
import { PageHeader } from "@/components/shell/PageHeader";
import { api } from "@/lib/api";
import { useProfile, useUpdateProfile } from "@/lib/queries/misc";
import { useCategories } from "@/lib/queries/people";
import { keys } from "@/lib/queries/keys";
import type { LocationInput } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export function SettingsView() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const { data: cats = [] } = useCategories();
  const [theme, setTheme] = useTheme();
  const [name, setName] = useState<string | null>(null);
  const [savedName, setSavedName] = useState(false);

  const home: LocationInput | null = profile?.homeLocation
    ? { cityId: profile.homeLocation.cityId, name: profile.homeLocation.name, admin: profile.homeLocation.admin, country: profile.homeLocation.country, countryCode: profile.homeLocation.countryCode, lat: profile.homeLocation.lat, lng: profile.homeLocation.lng, timezone: profile.homeLocation.timezone }
    : null;

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    qc.clear();
    router.replace("/login");
    router.refresh();
  };

  return (
    <>
      <PageHeader title="Settings" subtitle={profile?.email} />

      <div className="space-y-4">
        <GlassCard>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-fg-3">You</h2>
          <div className="space-y-4">
            <Field label="Name">
              <div className="flex gap-2">
                <GlassInput value={name ?? profile?.displayName ?? ""} onChange={(e) => { setName(e.target.value); setSavedName(false); }} placeholder="Your name" />
                <GlassButton
                  variant="soft"
                  className="h-12 shrink-0"
                  disabled={name === null || name === profile?.displayName}
                  onClick={() => update.mutate({ displayName: name }, { onSuccess: () => setSavedName(true) })}
                >
                  {savedName ? <Check size={16} /> : "Save"}
                </GlassButton>
              </div>
            </Field>
            <Field label="Home base" hint="Arcs on the globe start here. Change it when you move.">
              <CityPicker
                value={home}
                onChange={(l) => update.mutate({ homeLocation: l, ...(l?.timezone ? { timezone: l.timezone } : {}) })}
                placeholder="Where do you live?"
              />
            </Field>
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-fg-3">Daily follow-up email</h2>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[15px] font-medium">Send me who to contact today</p>
              <p className="text-[13px] text-fg-2">One email per day when something is due, at {String(profile?.digestHour ?? 7).padStart(2, "0")}:00 {profile?.timezone}.</p>
            </div>
            <Toggle checked={profile?.digestEnabled ?? true} onChange={(v) => update.mutate({ digestEnabled: v })} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[13px] text-fg-2">Send at</span>
            <select
              value={profile?.digestHour ?? 7}
              onChange={(e) => update.mutate({ digestHour: Number(e.target.value) })}
              className="glass h-9 rounded-full px-3 text-[14px] outline-none"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-fg-3">Appearance</h2>
          <div className="glass flex rounded-full p-1">
            {([["system", SunMoon, "Auto"], ["light", Sun, "Light"], ["dark", Moon, "Dark"]] as const).map(([t, Icon, label]) => (
              <button key={t} onClick={() => setTheme(t)} className={cn("pressable flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13.5px] font-medium", theme === t ? "bg-white text-fg shadow-sm dark:bg-white/10" : "text-fg-3")}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </GlassCard>

        <CategoriesCard cats={cats} />

        <GlassCard>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-fg-3">Your data</h2>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export" download className="pressable inline-flex h-10 items-center gap-2 rounded-full bg-accent-soft px-4 text-[15px] font-medium text-accent-strong">
              <Download size={16} /> Export everything (JSON)
            </a>
            <Link href="/import" className="pressable glass specular inline-flex h-10 items-center gap-2 rounded-full px-4 text-[15px] font-medium">
              <Upload size={16} /> Import from Apple Notes
            </Link>
          </div>
          <p className="mt-2 text-[12.5px] text-fg-3">Everything you put in is yours. Export any time; nothing is locked in.</p>
        </GlassCard>

        <GlassButton variant="danger" className="w-full" onClick={signOut}>
          <LogOut size={16} /> Sign out
        </GlassButton>
      </div>
    </>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-fg/15")}>
      <span className={cn("absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-[2px]")} />
    </button>
  );
}

const PALETTE = ["#7c5cff", "#ff6b6b", "#0fb5ba", "#f4b942", "#3b82f6", "#12a594", "#9aa9ab", "#ec4899", "#f97316", "#84cc16"];

function CategoriesCard({ cats }: { cats: { id: string; name: string; color: string; icon: string; sort: number }[] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<{ id?: string; name: string; color: string; icon: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.categories() });

  const save = async () => {
    if (!draft?.name.trim()) return;
    if (draft.id) await api.patch(`/api/categories/${draft.id}`, { name: draft.name.trim(), color: draft.color, icon: draft.icon });
    else await api.post("/api/categories", { name: draft.name.trim(), color: draft.color, icon: draft.icon, sort: cats.length + 1 });
    setDraft(null);
    refresh();
  };
  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete category “${name}”? People keep their other categories.`)) return;
    await api.delete(`/api/categories/${id}`);
    refresh();
  };

  return (
    <GlassCard>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-fg-3">Categories</h2>
        <button onClick={() => setDraft({ name: "", color: PALETTE[cats.length % PALETTE.length]!, icon: "sparkles" })} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong"><Plus size={14} /> Add</button>
      </div>
      <ul className="space-y-1">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-[12px] px-1 py-1">
            <button className="pressable flex-1 text-left" onClick={() => setDraft({ id: c.id, name: c.name, color: c.color, icon: c.icon })}>
              <Chip color={c.color}><CategoryIcon name={c.icon} size={13} /> {c.name}</Chip>
            </button>
            <button aria-label="Delete" onClick={() => remove(c.id, c.name)} className="pressable grid h-8 w-8 place-items-center rounded-full text-fg-4 hover:bg-danger/10 hover:text-danger"><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
      {draft && (
        <div className="mt-3 space-y-3 rounded-[var(--r-md)] bg-fg/4 p-3">
          <GlassInput autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Category name" onKeyDown={(e) => e.key === "Enter" && save()} />
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((col) => (
              <button key={col} aria-label={col} onClick={() => setDraft({ ...draft, color: col })} className={cn("h-7 w-7 rounded-full ring-offset-2 ring-offset-transparent", draft.color === col && "ring-2 ring-fg/40")} style={{ background: col }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_ICON_NAMES.map((ic) => (
              <button key={ic} aria-label={ic} onClick={() => setDraft({ ...draft, icon: ic })} className={cn("grid h-8 w-8 place-items-center rounded-full", draft.icon === ic ? "bg-accent text-accent-fg" : "bg-fg/6 text-fg-2")}>
                <CategoryIcon name={ic} size={15} />
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <GlassButton size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</GlassButton>
            <GlassButton size="sm" variant="primary" onClick={save}>{draft.id ? "Save" : "Add category"}</GlassButton>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
