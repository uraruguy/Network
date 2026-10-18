"use client";
import type { ReactNode } from "react";
import { GlassInput, GlassTextarea } from "@/components/glass/GlassInput";
import { confirm } from "@/components/ui/confirm";
import { BirthdayPicker } from "@/components/ui/date/BirthdayPicker";
import { DateField } from "@/components/ui/date/DateField";
import { toISODate } from "@/components/ui/date/presets";
import { Field } from "@/components/ui/Field";
import type { Circle, Warmth } from "@/lib/constants";
import { useNow } from "@/lib/clock";
import { useTags } from "@/lib/queries/taxonomy";
import type { PersonDetailApi } from "@/lib/queries/types";
import type { LocationInput, PersonInput, PersonPatch } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { ActivityPicker } from "./ActivityPicker";
import { CategoryPicker } from "./CategoryPicker";
import { CirclePicker } from "./CirclePicker";
import { CityPicker } from "./CityPicker";
import { PersonPicker, type PersonPick } from "./PersonPicker";
import { TagInput } from "./TagInput";
import { WarmthPicker } from "./WarmthPicker";

export type PersonFormValues = {
  displayName: string;
  headline: string;
  company: string;
  homeLocation: LocationInput | null;
  categoryIds: string[];
  warmth: Warmth;
  circle: Circle | null;
  activityIds: string[];
  tagNames: string[];
  introducedBy: PersonPick | null;
  metContext: string;
  metAt: string | null;
  metLocation: LocationInput | null;
  email: string;
  phone: string;
  linkedin: string;
  xHandle: string;
  instagram: string;
  website: string;
  birthday: string | null;
  languages: string[];
  interests: string[];
  howICanHelp: string;
  whatICanAsk: string;
};

export type PersonFormErrors = Partial<Record<keyof PersonFormValues, string>>;

export const emptyPerson: PersonFormValues = {
  displayName: "",
  headline: "",
  company: "",
  homeLocation: null,
  categoryIds: [],
  warmth: "active",
  circle: null,
  activityIds: [],
  tagNames: [],
  introducedBy: null,
  metContext: "",
  metAt: null,
  metLocation: null,
  email: "",
  phone: "",
  linkedin: "",
  xHandle: "",
  instagram: "",
  website: "",
  birthday: null,
  languages: [],
  interests: [],
  howICanHelp: "",
  whatICanAsk: "",
};

type Loc = NonNullable<PersonDetailApi["homeLocation"]>;
const toLocationInput = (l: Loc | null | undefined): LocationInput | null =>
  l ? { cityId: l.cityId, name: l.name, admin: l.admin, country: l.country, countryCode: l.countryCode, lat: l.lat, lng: l.lng, timezone: l.timezone } : null;

export function personToFormValues(p: PersonDetailApi): PersonFormValues {
  return {
    displayName: p.displayName,
    headline: p.headline ?? "",
    company: p.company ?? "",
    homeLocation: toLocationInput(p.homeLocation),
    categoryIds: p.categoryIds ?? [],
    warmth: p.warmth,
    circle: p.circle,
    activityIds: p.activityIds ?? [],
    tagNames: (p.tags ?? []).map((t) => t.name),
    introducedBy: p.introducedBy ? { id: p.introducedBy.id, displayName: p.introducedBy.displayName, avatarUrl: p.introducedBy.avatarUrl } : null,
    metContext: p.metContext ?? "",
    metAt: p.metAt ? String(p.metAt).slice(0, 10) : null,
    metLocation: toLocationInput(p.metLocation),
    email: p.email ?? "",
    phone: p.phone ?? "",
    linkedin: p.linkedin ?? "",
    xHandle: p.xHandle ?? "",
    instagram: p.instagram ?? "",
    website: p.website ?? "",
    birthday: p.birthday ? String(p.birthday).slice(0, 10) : null,
    languages: p.languages ?? [],
    interests: p.interests ?? [],
    howICanHelp: p.howICanHelp ?? "",
    whatICanAsk: p.whatICanAsk ?? "",
  };
}

const str = (x: string) => (x.trim() ? x.trim() : null);
const handle = (x: string) => str(x.replace(/^@+/, "@"));

/** Full create input. */
export function toPersonInput(v: PersonFormValues): PersonInput {
  return {
    displayName: v.displayName.replace(/\s+/g, " ").trim(),
    headline: str(v.headline),
    company: str(v.company),
    homeLocation: v.homeLocation,
    categoryIds: v.categoryIds,
    warmth: v.warmth,
    circle: v.circle,
    activityIds: v.activityIds,
    tagNames: v.tagNames,
    introducedById: v.introducedBy?.id ?? null,
    metContext: str(v.metContext),
    metAt: v.metAt,
    metLocation: v.metLocation,
    email: str(v.email),
    phone: str(v.phone),
    linkedin: str(v.linkedin),
    xHandle: handle(v.xHandle),
    instagram: handle(v.instagram),
    website: str(v.website),
    birthday: v.birthday,
    languages: v.languages,
    interests: v.interests,
    howICanHelp: str(v.howICanHelp),
    whatICanAsk: str(v.whatICanAsk),
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const locKey = (l: LocationInput | null | undefined) => (l ? `${l.cityId ?? ""}|${l.name}|${l.country}` : null);

/** Only what changed between `initial` and `v` (a minimal PATCH body). */
export function toPersonPatch(initial: PersonFormValues, v: PersonFormValues): PersonPatch {
  const a = toPersonInput(initial);
  const b = toPersonInput(v);
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(b) as (keyof PersonInput)[]) {
    if (key === "homeLocation" || key === "metLocation") {
      if (locKey(a[key]) !== locKey(b[key])) patch[key] = b[key] ?? null;
    } else if (!sameJson(a[key], b[key])) patch[key] = b[key];
  }
  return patch as PersonPatch;
}

export function isPersonDirty(initial: PersonFormValues, v: PersonFormValues) {
  return Object.keys(toPersonPatch(initial, v)).length > 0;
}

/** Asks before throwing away edits. Resolves true when it's fine to close. */
export async function confirmDiscard(dirty: boolean): Promise<boolean> {
  if (!dirty) return true;
  return confirm({ title: "Discard changes?", message: "Your edits won’t be saved.", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePerson(v: PersonFormValues): PersonFormErrors {
  const errors: PersonFormErrors = {};
  if (!v.displayName.trim()) errors.displayName = "Add a name";
  if (v.email.trim() && !EMAIL.test(v.email.trim())) errors.email = "That doesn’t look like an email address";
  if (v.website.trim() && /\s/.test(v.website.trim())) errors.website = "A web address can’t contain spaces";
  return errors;
}

/* ------------------------------------------------------------------ */

export function FormSection({ title, footer, children, className }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-1.5", className)}>
      {title && <h3 className="px-4 text-footnote font-medium tracking-[0.02em] text-fg-3 uppercase">{title}</h3>}
      <div className="surface space-y-4 rounded-lg p-4">{children}</div>
      {footer && <p className="px-4 text-footnote text-fg-3">{footer}</p>}
    </section>
  );
}

type FieldsProps = {
  values: PersonFormValues;
  onChange: (patch: Partial<PersonFormValues>) => void;
  errors?: PersonFormErrors;
  /** The person being edited (excluded from "introduced by"). */
  personId?: string;
  autoFocusName?: boolean;
  /** Hide the name block (quick add renders its own). */
  hideName?: boolean;
};

/** Every editable person field, grouped like a Contacts card. Controlled; validate with `validatePerson`. */
export function PersonFormFields({ values: v, onChange, errors = {}, personId, autoFocusName, hideName }: FieldsProps) {
  const now = useNow();
  const { data: tags } = useTags();
  // Most-used first (ties stay alphabetical); typed matches rank above everything.
  const tagSuggestions = (tags ?? []).map((t) => ({ name: t.name, count: t.count, color: t.color })).sort((a, b) => b.count - a.count);
  const text = (key: keyof PersonFormValues) => ({
    value: v[key] as string,
    onChange: (e: { target: { value: string } }) => onChange({ [key]: e.target.value } as Partial<PersonFormValues>),
  });

  return (
    <div className="space-y-6 pb-2">
      <FormSection title={hideName ? "Work" : "Name & work"}>
        {!hideName && (
          <Field label="Name" required error={errors.displayName}>
            <GlassInput {...text("displayName")} autoFocus={autoFocusName} autoComplete="off" autoCapitalize="words" enterKeyHint="next" placeholder="Full name" maxLength={200} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role">
            <GlassInput {...text("headline")} placeholder="Product designer" autoComplete="off" />
          </Field>
          <Field label="Company">
            <GlassInput {...text("company")} placeholder="Company" autoComplete="off" />
          </Field>
        </div>
      </FormSection>

      {!hideName && (
        <FormSection title="Location">
          <Field label="Lives in">
            <CityPicker value={v.homeLocation} onChange={(homeLocation) => onChange({ homeLocation })} placeholder="Search a city" />
          </Field>
        </FormSection>
      )}

      <FormSection title="Relationship">
        <Field label="Categories">
          <CategoryPicker value={v.categoryIds} onChange={(categoryIds) => onChange({ categoryIds })} />
        </Field>
        <Field label="Warmth">
          <WarmthPicker value={v.warmth} onChange={(warmth) => onChange({ warmth })} />
        </Field>
        <Field label="Circle">
          <CirclePicker value={v.circle} onChange={(circle) => onChange({ circle })} />
        </Field>
      </FormSection>

      {!hideName && (
        <FormSection title="Do together">
          <ActivityPicker value={v.activityIds} onChange={(activityIds) => onChange({ activityIds })} />
        </FormSection>
      )}

      <FormSection title="Who they are" footer="Enter or comma adds a tag. Tags you use often show up first.">
        <TagInput value={v.tagNames} onChange={(tagNames) => onChange({ tagNames })} suggestions={tagSuggestions} placeholder="Founder, climber, Slovenian…" aria-label="Tags" />
      </FormSection>

      <FormSection title="How we met">
        <Field label="Context">
          <GlassTextarea {...text("metContext")} placeholder="Where, through whom, what we talked about" rows={3} />
        </Field>
        <Field label="Introduced by">
          <PersonPicker value={v.introducedBy} onChange={(introducedBy) => onChange({ introducedBy })} exclude={personId ? [personId] : undefined} placeholder="Search people" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Met on">
            <DateField value={v.metAt} onChange={(metAt) => onChange({ metAt })} presets="past" max={toISODate(new Date(now))} clearable label="Met on" placeholder="Add date" />
          </Field>
          <Field label="Met in">
            <CityPicker value={v.metLocation} onChange={(metLocation) => onChange({ metLocation })} placeholder="Search a city" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <GlassInput {...text("phone")} type="tel" inputMode="tel" autoComplete="off" placeholder="+386 …" />
          </Field>
          <Field label="Email" error={errors.email}>
            <GlassInput {...text("email")} type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="name@example.com" />
          </Field>
          <Field label="LinkedIn">
            <GlassInput {...text("linkedin")} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="linkedin.com/in/…" />
          </Field>
          <Field label="X">
            <GlassInput {...text("xHandle")} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="@handle" />
          </Field>
          <Field label="Instagram">
            <GlassInput {...text("instagram")} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="@handle" />
          </Field>
          <Field label="Website" error={errors.website}>
            <GlassInput {...text("website")} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="example.com" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Birthday">
        <Field
          label="Birthday"
          accessory={
            v.birthday ? (
              <button type="button" onClick={() => onChange({ birthday: null })} className="hit-44 relative font-medium text-accent-text">
                Clear
              </button>
            ) : undefined
          }
        >
          <BirthdayPicker value={v.birthday} onChange={(birthday) => onChange({ birthday })} />
        </Field>
      </FormSection>

      <FormSection title="About">
        <Field label="Languages">
          <TagInput value={v.languages} onChange={(languages) => onChange({ languages })} noun="language" placeholder="English, Slovenian…" maxLength={60} />
        </Field>
        <Field label="Interests">
          <TagInput value={v.interests} onChange={(interests) => onChange({ interests })} noun="interest" placeholder="Jazz, sailing, AI…" maxLength={80} />
        </Field>
      </FormSection>

      <FormSection title="Help & ask">
        <Field label="How I can help them">
          <GlassTextarea {...text("howICanHelp")} placeholder="Intros, advice, a place to stay…" rows={2} />
        </Field>
        <Field label="What I can ask them">
          <GlassTextarea {...text("whatICanAsk")} placeholder="Their expertise, people they know…" rows={2} />
        </Field>
      </FormSection>
    </div>
  );
}
