"use client";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { Field, GlassInput, GlassTextarea } from "@/components/glass/GlassInput";
import type { Circle, Hobby, Warmth } from "@/lib/db/schema";
import { CirclePicker } from "./CirclePicker";
import { HobbyPicker } from "./HobbyPicker";
import { PersonPicker } from "./PersonPicker";
import type { LocationInput, PersonInput } from "@/lib/schemas";
import { CategoryPicker } from "./CategoryPicker";
import { CityPicker } from "./CityPicker";
import { WarmthPicker } from "./WarmthPicker";

export type PersonFormValues = {
  displayName: string;
  headline: string;
  company: string;
  homeLocation: LocationInput | null;
  categoryIds: string[];
  warmth: Warmth;
  circle: Circle | null;
  hobbies: Hobby[];
  hobbiesOther: string;
  introducedBy: { id: string; displayName: string } | null;
  metContext: string;
  metAt: string;
  metLocation: LocationInput | null;
  email: string;
  phone: string;
  linkedin: string;
  xHandle: string;
  instagram: string;
  website: string;
  birthday: string;
  howICanHelp: string;
  whatICanAsk: string;
};

export const emptyPerson: PersonFormValues = {
  displayName: "",
  headline: "",
  company: "",
  homeLocation: null,
  categoryIds: [],
  warmth: "active",
  circle: null,
  hobbies: [],
  hobbiesOther: "",
  introducedBy: null,
  metContext: "",
  metAt: "",
  metLocation: null,
  email: "",
  phone: "",
  linkedin: "",
  xHandle: "",
  instagram: "",
  website: "",
  birthday: "",
  howICanHelp: "",
  whatICanAsk: "",
};

export function toPersonInput(v: PersonFormValues): PersonInput {
  const s = (x: string) => (x.trim() ? x.trim() : null);
  return {
    displayName: v.displayName.trim(),
    headline: s(v.headline),
    company: s(v.company),
    homeLocation: v.homeLocation,
    categoryIds: v.categoryIds,
    warmth: v.warmth,
    circle: v.circle,
    hobbies: v.hobbies,
    hobbiesOther: v.hobbies.includes("other") ? s(v.hobbiesOther) : null,
    introducedById: v.introducedBy?.id ?? null,
    metContext: s(v.metContext),
    metAt: v.metAt || null,
    metLocation: v.metLocation,
    email: s(v.email),
    phone: s(v.phone),
    linkedin: s(v.linkedin),
    xHandle: s(v.xHandle),
    instagram: s(v.instagram),
    website: s(v.website),
    birthday: v.birthday || null,
    howICanHelp: s(v.howICanHelp),
    whatICanAsk: s(v.whatICanAsk),
    languages: [],
    interests: [],
  };
}

type Props = {
  initial?: PersonFormValues;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: PersonFormValues) => void;
  onCancel?: () => void;
};

export function PersonForm({ initial = emptyPerson, submitLabel, busy, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<PersonFormValues>(initial);
  const [more, setMore] = useState(false);
  const set = <K extends keyof PersonFormValues>(k: K, val: PersonFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.displayName.trim()) return;
        onSubmit(v);
      }}
    >
      <Field label="Name">
        <GlassInput autoFocus value={v.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="Who did you meet?" autoComplete="off" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role">
          <GlassInput value={v.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Founder, VC, …" />
        </Field>
        <Field label="Company">
          <GlassInput value={v.company} onChange={(e) => set("company", e.target.value)} placeholder="Where they work" />
        </Field>
      </div>
      <Field label="Lives in">
        <CityPicker value={v.homeLocation} onChange={(l) => set("homeLocation", l)} placeholder="Search a city…" />
      </Field>
      <Field label="They are…">
        <CategoryPicker value={v.categoryIds} onChange={(ids) => set("categoryIds", ids)} />
      </Field>
      <Field label="Warmth">
        <WarmthPicker value={v.warmth} onChange={(w) => set("warmth", w)} />
      </Field>
      <Field label="Circle" hint="How close do you want this relationship to become?">
        <CirclePicker value={v.circle} onChange={(c) => set("circle", c)} />
      </Field>
      <Field label="Hobbies">
        <HobbyPicker value={v.hobbies} other={v.hobbiesOther} onChange={(h) => set("hobbies", h)} onOtherChange={(o) => set("hobbiesOther", o)} />
      </Field>
      <Field label="Introduced by">
        <PersonPicker value={v.introducedBy} onChange={(p) => set("introducedBy", p)} placeholder="Who connected you?" />
      </Field>
      <Field label="How we met" hint="Where, when, in what situation. Future you will thank you.">
        <GlassTextarea value={v.metContext} onChange={(e) => set("metContext", e.target.value)} placeholder="Coffee after the Claude meetup in SF, introduced by Joel…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Met on">
          <GlassInput type="date" value={v.metAt} onChange={(e) => set("metAt", e.target.value)} />
        </Field>
        <Field label="Met in">
          <CityPicker value={v.metLocation} onChange={(l) => set("metLocation", l)} placeholder="City" />
        </Field>
      </div>

      <button type="button" onClick={() => setMore((m) => !m)} className="flex items-center gap-1.5 px-1 text-[14px] font-medium text-accent-strong">
        <ChevronDown size={16} className={more ? "rotate-180 transition-transform" : "transition-transform"} />
        {more ? "Fewer details" : "More details"}
      </button>
      <AnimatePresence initial={false}>
        {more && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email"><GlassInput type="email" value={v.email} onChange={(e) => set("email", e.target.value)} /></Field>
                <Field label="Phone"><GlassInput type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
                <Field label="LinkedIn"><GlassInput value={v.linkedin} onChange={(e) => set("linkedin", e.target.value)} placeholder="URL or handle" /></Field>
                <Field label="X"><GlassInput value={v.xHandle} onChange={(e) => set("xHandle", e.target.value)} placeholder="@handle" /></Field>
                <Field label="Instagram"><GlassInput value={v.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@handle" /></Field>
                <Field label="Website"><GlassInput value={v.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></Field>
                <Field label="Birthday"><GlassInput type="date" value={v.birthday} onChange={(e) => set("birthday", e.target.value)} /></Field>
              </div>
              <Field label="How I can help them"><GlassTextarea value={v.howICanHelp} onChange={(e) => set("howICanHelp", e.target.value)} className="min-h-16" /></Field>
              <Field label="What I can ask them"><GlassTextarea value={v.whatICanAsk} onChange={(e) => set("whatICanAsk", e.target.value)} className="min-h-16" /></Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <GlassButton type="button" variant="ghost" onClick={onCancel}>Cancel</GlassButton>}
        <GlassButton type="submit" variant="primary" disabled={busy || !v.displayName.trim()}>{busy ? "Saving…" : submitLabel}</GlassButton>
      </div>
    </form>
  );
}

export function personToFormValues(p: {
  displayName: string; headline: string | null; company: string | null;
  homeLocation: { cityId: number | null; name: string; admin: string | null; country: string; countryCode: string | null; lat: number; lng: number; timezone: string | null } | null;
  metLocation: { cityId: number | null; name: string; admin: string | null; country: string; countryCode: string | null; lat: number; lng: number; timezone: string | null } | null;
  categories: { id: string }[]; warmth: Warmth; circle: Circle | null; hobbies: string[]; hobbiesOther: string | null;
  introducedBy: { id: string; displayName: string } | null; metContext: string | null; metAt: string | null;
  email: string | null; phone: string | null; linkedin: string | null; xHandle: string | null; instagram: string | null; website: string | null; birthday: string | null;
  howICanHelp: string | null; whatICanAsk: string | null;
}): PersonFormValues {
  const loc = (l: typeof p.homeLocation): LocationInput | null =>
    l ? { cityId: l.cityId, name: l.name, admin: l.admin, country: l.country, countryCode: l.countryCode, lat: l.lat, lng: l.lng, timezone: l.timezone } : null;
  return {
    displayName: p.displayName,
    headline: p.headline ?? "",
    company: p.company ?? "",
    homeLocation: loc(p.homeLocation),
    categoryIds: p.categories.map((c) => c.id),
    warmth: p.warmth,
    circle: p.circle,
    hobbies: p.hobbies as Hobby[],
    hobbiesOther: p.hobbiesOther ?? "",
    introducedBy: p.introducedBy ? { id: p.introducedBy.id, displayName: p.introducedBy.displayName } : null,
    metContext: p.metContext ?? "",
    metAt: p.metAt ?? "",
    metLocation: loc(p.metLocation),
    email: p.email ?? "",
    phone: p.phone ?? "",
    linkedin: p.linkedin ?? "",
    xHandle: p.xHandle ?? "",
    instagram: p.instagram ?? "",
    website: p.website ?? "",
    birthday: p.birthday ?? "",
    howICanHelp: p.howICanHelp ?? "",
    whatICanAsk: p.whatICanAsk ?? "",
  };
}
