"use client";
import {
  Archive,
  Bell,
  Bookmark,
  Cake,
  Copy,
  Globe2,
  Inbox,
  Mail,
  MapPin,
  Moon,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Share,
  Sparkles,
  Sun,
  SunMoon,
  Trash2,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { Chip } from "@/components/glass/Chip";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassInput } from "@/components/glass/GlassInput";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { Combobox, filterByQuery } from "@/components/ui/Combobox";
import { confirm } from "@/components/ui/confirm";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { BirthdayPicker, formatBirthday } from "@/components/ui/date/BirthdayPicker";
import { Calendar } from "@/components/ui/date/Calendar";
import { DateField } from "@/components/ui/date/DateField";
import { TimePicker } from "@/components/ui/date/TimePicker";
import { toISODate } from "@/components/ui/date/presets";
import { Dialog, DialogClose } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { Menu } from "@/components/ui/Menu";
import { NumberField } from "@/components/ui/NumberField";
import { Popover } from "@/components/ui/Popover";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { ResponsivePopover } from "@/components/ui/ResponsivePopover";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton, SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/Toast";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { Tooltip, TooltipProvider } from "@/components/ui/Tooltip";
import { PALETTE } from "@/lib/constants/palette";
import { useNow } from "@/lib/clock";
import { useThemePreference } from "@/lib/theme";
import { cn, WARMTH_META } from "@/lib/utils";

/* ------------------------------------------------------------------ */

const TYPE = [
  ["large-title", "Large Title", "34 / 41 bold"],
  ["title1", "Title 1", "28 / 34 bold"],
  ["title2", "Title 2", "22 / 28 semibold"],
  ["title3", "Title 3", "20 / 25 semibold"],
  ["headline", "Headline", "17 / 22 semibold"],
  ["body", "Body — the quick brown fox", "17 / 22"],
  ["callout", "Callout", "16 / 21"],
  ["subhead", "Subhead", "15 / 20"],
  ["footnote", "Footnote", "13 / 18"],
  ["caption", "Caption", "12 / 16"],
  ["caption2", "Caption 2", "11 / 13"],
] as const;

const TYPE_CLASS: Record<(typeof TYPE)[number][0], string> = {
  "large-title": "text-large-title",
  title1: "text-title1",
  title2: "text-title2",
  title3: "text-title3",
  headline: "text-headline",
  body: "text-body",
  callout: "text-callout",
  subhead: "text-subhead",
  footnote: "text-footnote",
  caption: "text-caption",
  caption2: "text-caption2",
};

/** A saturated v1 category colour, to show palette snapping. */
const LEGACY_CATEGORY_HEX = "#7c5cff"; // design-ignore

const ACCENT_STEPS =[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

type Person = { id: string; name: string; city: string };
const PEOPLE: Person[] = [
  { id: "1", name: "Žan Kovačič", city: "Ljubljana" },
  { id: "2", name: "Ana Novak", city: "Maribor" },
  { id: "3", name: "Luka Horvat", city: "Vienna" },
  { id: "4", name: "Špela Krajnc", city: "Berlin" },
  { id: "5", name: "Matej Lukić", city: "Zagreb" },
  { id: "6", name: "Søren Østergaard", city: "Copenhagen" },
  { id: "7", name: "Hana Potočnik", city: "London" },
  { id: "8", name: "Jakob Zupan", city: "Ljubljana" },
];
const searchPeople = (q: string) =>
  new Promise<Person[]>((resolve) => setTimeout(() => resolve(filterByQuery(PEOPLE, q, (p) => `${p.name} ${p.city}`)), 250));

const CITIES = ["Ljubljana", "Maribor", "Koper", "Vienna", "Zagreb", "Trieste", "Munich", "Berlin", "London", "New York", "São Paulo", "Zürich"].map((c) => ({
  value: c.toLowerCase(),
  label: c,
}));

/* ------------------------------------------------------------------ */

function Section({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-6 space-y-3", className)}>
      <h2 className="px-1 text-title2">{title}</h2>
      {children}
    </section>
  );
}

function Demo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <GlassCard className={cn("min-w-0 space-y-3", className)}>
      <p className="text-footnote font-semibold text-fg-3 uppercase tracking-[0.02em]">{label}</p>
      {children}
    </GlassCard>
  );
}

function Swatch({ name, value, className }: { name: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <div className={cn("h-12 rounded-sm ring-[0.5px] ring-hairline", className)} style={{ background: value }} />
      <p className="mt-1 truncate text-caption font-medium">{name}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Playground() {
  const [theme, setTheme] = useThemePreference();
  return (
    <TooltipProvider>
      <div className="app-bg" aria-hidden />
      <div className="mx-auto w-full max-w-[1120px] space-y-10 px-4 pt-[calc(16px+var(--sat))] pb-[calc(48px+var(--sab))] sm:px-6 lg:px-10 lg:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-footnote font-semibold text-accent-text uppercase tracking-[0.04em]">The Network</p>
            <h1 className="text-large-title">Design system</h1>
            <p className="mt-1 text-subhead text-fg-2">Tokens, glass and every app-native primitive. Light + dark, phone + desktop.</p>
          </div>
          <SegmentedControl
            aria-label="Appearance"
            value={theme}
            onChange={setTheme}
            items={[
              { value: "system", label: "Auto", icon: <SunMoon /> },
              { value: "light", label: "Light", icon: <Sun /> },
              { value: "dark", label: "Dark", icon: <Moon /> },
            ]}
          />
        </header>

        <TypeSection />
        <ColorSection />
        <SurfaceSection />
        <ButtonSection />
        <InputSection />
        <OverlaySection />
        <DateSection />
        <ListSection />
      </div>
    </TooltipProvider>
  );
}

/* ---------- Type ---------- */

function TypeSection() {
  return (
    <Section id="type" title="Type scale">
      <GlassCard className="divide-y-[0.5px] divide-separator p-0 sm:p-0">
        {TYPE.map(([key, sample, spec]) => (
          <div key={key} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-5">
            <span className={cn(TYPE_CLASS[key], "min-w-0 truncate")}>{sample}</span>
            <span className="shrink-0 text-caption text-fg-3 tabular-nums">
              text-{key} · {spec}
            </span>
          </div>
        ))}
      </GlassCard>
    </Section>
  );
}

/* ---------- Colour ---------- */

function ColorSection() {
  return (
    <Section id="color" title="Colour">
      <div className="grid gap-4 md:grid-cols-2">
        <Demo label="Accent (oklch, hue 194)" className="md:col-span-2">
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
            {ACCENT_STEPS.map((s) => (
              <Swatch key={s} name={String(s)} value={`var(--accent-${s})`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Swatch name="accent" value="var(--accent)" />
            <Swatch name="accent-fill" value="var(--accent-fill)" />
            <Swatch name="accent-text" value="var(--accent-text)" />
            <Swatch name="accent-soft" value="var(--accent-soft)" />
            <Swatch name="focus-ring" value="var(--focus-ring)" />
            <Swatch name="accent-fg" value="var(--accent-fg)" />
          </div>
        </Demo>
        <Demo label="Neutrals">
          <div className="grid grid-cols-4 gap-2">
            {["bg", "bg-2", "bg-3", "surface-solid", "fg", "fg-2", "fg-3", "fg-4"].map((n) => (
              <Swatch key={n} name={n} value={`var(--${n})`} />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {["fill-1", "fill-2", "fill-3", "hairline-strong"].map((n) => (
              <Swatch key={n} name={n} value={`var(--${n})`} />
            ))}
          </div>
        </Demo>
        <Demo label="Semantic & warmth">
          <div className="grid grid-cols-3 gap-2">
            {["danger", "success", "warning"].map((n) => (
              <Swatch key={n} name={n} value={`var(--${n})`} />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(WARMTH_META) as (keyof typeof WARMTH_META)[]).map((w) => (
              <Swatch key={w} name={WARMTH_META[w].label} value={WARMTH_META[w].color} />
            ))}
          </div>
        </Demo>
        <Demo label="Category palette (muted, L≈.68 C≈.10)" className="md:col-span-2">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {PALETTE.map((p) => (
              <Swatch key={p.id} name={p.label} value={p.cssVar} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((p) => (
              <Chip key={p.id} color={p.hex}>
                {p.label}
              </Chip>
            ))}
          </div>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------- Surfaces ---------- */

function SurfaceSection() {
  const [moving, setMoving] = useState(false);
  return (
    <Section id="surfaces" title="Glass, radii, elevation">
      <div
        data-map-moving={moving || undefined}
        className="relative overflow-hidden rounded-xl p-4 sm:p-6"
        style={{
          background:
            "radial-gradient(circle at 15% 25%, var(--palette-teal) 0 18%, transparent 19%), radial-gradient(circle at 70% 70%, var(--palette-coral) 0 14%, transparent 15%), radial-gradient(circle at 85% 20%, var(--palette-indigo) 0 12%, transparent 13%), linear-gradient(135deg, var(--accent-100), var(--bg-3))",
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["surface", "No blur · cards, lists, inputs", "surface"],
            ["glass", "Blur 20 · floating chrome", "glass specular"],
            ["glass-thick", "Blur 30 · menus, sheets", "glass-thick specular"],
            ["glass-map", moving ? "Map moving → opaque, no blur" : "Map overlays · blur when still", "glass-map specular"],
          ].map(([name, hint, cls]) => (
            <div key={name} className={cn(cls, "rounded-lg p-4")}>
              <p className="text-headline">{name}</p>
              <p className="mt-0.5 text-footnote text-fg-2">{hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="glass-thick specular-ring rounded-lg px-4 py-3">
            <p className="text-headline">specular-ring</p>
            <p className="text-footnote text-fg-2">Hero only (masked gradient)</p>
          </div>
          <Switch label="Simulate map moving" checked={moving} onCheckedChange={setMoving} className="glass rounded-full py-1 pr-2 pl-4" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Demo label="Radii — concentric">
          <div className="flex flex-wrap items-end gap-3">
            {(
              [
                ["xs", "rounded-xs"],
                ["sm", "rounded-sm"],
                ["md", "rounded-md"],
                ["lg", "rounded-lg"],
                ["xl", "rounded-xl"],
              ] as const
            ).map(([r, cls]) => (
              <div key={r} className="text-center">
                <div className={cn("size-16 bg-accent-soft ring-1 ring-accent/40", cls)} />
                <p className="mt-1 text-caption text-fg-3">rounded-{r}</p>
              </div>
            ))}
          </div>
          <div className="surface w-fit rounded-lg p-1.5">
            <div className="rounded-md bg-accent-soft px-4 py-2 text-footnote text-accent-text">22 outer − 6 padding = 16 inner</div>
          </div>
        </Demo>
        <Demo label="Elevation">
          <div className="grid grid-cols-4 gap-3 pb-2">
            {["shadow-e1", "shadow-e2", "shadow-e3", "shadow-e4"].map((cls) => (
              <div key={cls} className={cn("grid h-16 place-items-center rounded-md bg-surface-solid text-footnote text-fg-2", cls)}>
                {cls.slice(7)}
              </div>
            ))}
          </div>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------- Buttons ---------- */

function ButtonSection() {
  const [loading, setLoading] = useState(false);
  const [bell, setBell] = useState(false);
  return (
    <Section id="buttons" title="Buttons">
      <div className="grid gap-4 md:grid-cols-2">
        <Demo label="GlassButton variants">
          <div className="flex flex-wrap gap-2">
            {(["primary", "glass", "surface", "soft", "plain", "ghost", "danger", "destructive"] as const).map((v) => (
              <GlassButton key={v} variant={v}>
                {v}
              </GlassButton>
            ))}
          </div>
        </Demo>
        <Demo label="Sizes & states">
          <div className="flex flex-wrap items-center gap-2">
            <GlassButton variant="primary" size="sm">
              Small
            </GlassButton>
            <GlassButton variant="primary">Medium</GlassButton>
            <GlassButton variant="primary" size="lg">
              <Plus size={18} /> Large
            </GlassButton>
            <GlassButton
              variant="soft"
              loading={loading}
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 1500);
              }}
            >
              Save
            </GlassButton>
            <GlassButton disabled>Disabled</GlassButton>
          </div>
        </Demo>
        <Demo label="IconButton (44px hit area)" className="md:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            {(["fill", "glass", "plain", "accent", "primary", "danger"] as const).map((v) => (
              <Tooltip key={v} content={`variant="${v}"`}>
                <IconButton label={v} variant={v} icon={v === "danger" ? <Trash2 /> : v === "primary" ? <Plus /> : <Share />} />
              </Tooltip>
            ))}
            <span className="mx-1 h-6 w-px bg-separator" />
            <IconButton label="Small" size="sm" icon={<Pencil />} />
            <IconButton label="Medium" size="md" icon={<Pencil />} />
            <IconButton label="Large" size="lg" icon={<Pencil />} />
            <Tooltip content="Notifications" shortcut="⌘N">
              <IconButton label="Notifications" variant="plain" pressed={bell} onClick={() => setBell((b) => !b)} icon={<Bell />} />
            </Tooltip>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------- Inputs ---------- */

function InputSection() {
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState<number | null>(30);
  const [city, setCity] = useState<string | null>("ljubljana");
  const [city2, setCity2] = useState<string | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [people, setPeople] = useState<Person[]>([PEOPLE[1]!]);
  const [notify, setNotify] = useState(true);
  const [view, setView] = useState<"list" | "globe" | "graph">("list");
  const [filters, setFilters] = useState<string[]>(["inner"]);
  const [tab, setTab] = useState<"notes" | "reminders" | "about">("notes");
  const [pillTab, setPillTab] = useState<"all" | "due" | "done">("all");
  return (
    <Section id="inputs" title="Inputs & controls">
      <div className="grid gap-4 md:grid-cols-2">
        <Demo label="Text">
          <form noValidate className="space-y-3" onSubmit={(e) => e.preventDefault()}>
            <Field label="Name" hint="As you'd say it out loud." required>
              <GlassInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Anna Novak" />
            </Field>
            <Field label="Email" error="That doesn't look like an email address.">
              <GlassInput defaultValue="anna@" type="email" />
            </Field>
            <SearchField value={q} onChange={setQ} placeholder="Search people" />
          </form>
        </Demo>
        <Demo label="Select · NumberField · Switch">
          <Field label="City">
            <Select value={city} onChange={setCity} options={CITIES.slice(0, 6)} />
          </Field>
          <Field label="City (searchable, diacritic-insensitive)">
            <Select value={city2} onChange={setCity2} options={CITIES} searchable placeholder="Choose a city" />
          </Field>
          <Field label="Repeat every">
            <NumberField value={days} onChange={setDays} min={1} max={365} unit="days" aria-label="Repeat every" />
          </Field>
          <Switch label="Daily digest" description="One email when something is due" checked={notify} onCheckedChange={setNotify} />
        </Demo>
        <Demo label="Combobox (async, try “zan” or “ostergaard”)">
          <Field label="Introduced by">
            <Combobox<Person>
              value={person}
              onChange={setPerson}
              search={searchPeople}
              getKey={(p) => p.id}
              getLabel={(p) => p.name}
              placeholder="Search people"
              renderItem={(p) => (
                <span className="flex items-center gap-2.5">
                  <Avatar name={p.name} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate">{p.name}</span>
                    <span className="block truncate text-footnote text-fg-3">{p.city}</span>
                  </span>
                </span>
              )}
            />
          </Field>
          <Field label="Met with (multiple, creatable)">
            <Combobox<Person>
              multiple
              creatable
              value={people}
              onChange={setPeople}
              search={(qq) => filterByQuery(PEOPLE, qq, (p) => p.name)}
              onCreate={(text) => ({ id: `new-${text}`, name: text, city: "—" })}
              getKey={(p) => p.id}
              getLabel={(p) => p.name}
              placeholder="Add people"
              renderItem={(p) => p.name}
            />
          </Field>
        </Demo>
        <Demo label="SegmentedControl · ToggleChip · Chip">
          <SegmentedControl
            fullWidth
            aria-label="View"
            value={view}
            onChange={setView}
            items={[
              { value: "list", label: "List", icon: <Users /> },
              { value: "globe", label: "Globe", icon: <Globe2 /> },
              { value: "graph", label: "Graph", icon: <Sparkles /> },
            ]}
          />
          <SegmentedControl
            size="sm"
            aria-label="Range"
            value={pillTab}
            onChange={setPillTab}
            items={[
              { value: "all", label: "All" },
              { value: "due", label: "Due" },
              { value: "done", label: "Done" },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            {(Object.keys(WARMTH_META) as (keyof typeof WARMTH_META)[]).map((w) => (
              <ToggleChip
                key={w}
                pressed={filters.includes(w)}
                onPressedChange={(p) => setFilters((f) => (p ? [...f, w] : f.filter((x) => x !== w)))}
                icon={<span className="size-2 rounded-full" style={{ background: WARMTH_META[w].color }} />}
                showCheck
              >
                {WARMTH_META[w].label}
              </ToggleChip>
            ))}
            <ToggleChip
              pressed={filters.includes("cat")}
              onPressedChange={(p) => setFilters((f) => (p ? [...f, "cat"] : f.filter((x) => x !== "cat")))}
              color={LEGACY_CATEGORY_HEX}
            >
              Legacy {LEGACY_CATEGORY_HEX} → muted
            </ToggleChip>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip>Default</Chip>
            <Chip active>Active</Chip>
            <Chip size="sm" color="var(--palette-green)">
              Small tinted
            </Chip>
          </div>
        </Demo>
        <Demo label="Tabs" className="md:col-span-2">
          <Tabs
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "notes", label: "Notes", badge: 12 },
              { value: "reminders", label: "Reminders", badge: 2 },
              { value: "about", label: "About" },
            ]}
          >
            <TabPanel value="notes">
              <SkeletonText lines={2} />
            </TabPanel>
            <TabPanel value="reminders">
              <p className="text-subhead text-fg-2">Two follow-ups due this week.</p>
            </TabPanel>
            <TabPanel value="about">
              <p className="text-subhead text-fg-2">Met at a conference in Vienna.</p>
            </TabPanel>
          </Tabs>
          <Tabs
            variant="pill"
            value={pillTab}
            onValueChange={setPillTab}
            items={[
              { value: "all", label: "All" },
              { value: "due", label: "Due" },
              { value: "done", label: "Done" },
            ]}
          />
        </Demo>
      </div>
    </Section>
  );
}

/* ---------- Overlays ---------- */

function OverlaySection() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheet, setSheetKind] = useState<"auto" | "large" | "snap">("auto");
  const openSheet = (kind: typeof sheet) => {
    setSheetKind(kind);
    setSheetOpen(true);
  };
  const [dialog, setDialog] = useState(false);
  const [actions, setActions] = useState(false);
  const [title, setTitle] = useState("Coffee with Ana");
  const menuItems = [
    { label: "Edit", icon: <Pencil />, onSelect: () => toast("Edit"), shortcut: "⌘E" },
    { label: "Duplicate", icon: <Copy />, onSelect: () => toast("Duplicated") },
    { label: "Bookmark", icon: <Bookmark />, onSelect: () => toast.success("Bookmarked") },
    "separator" as const,
    { label: "Archive", icon: <Archive />, onSelect: () => toast.undo("Archived", () => toast("Restored")) },
    { label: "Delete", icon: <Trash2 />, destructive: true, onSelect: () => void confirmDelete(), shortcut: "⌘⌫" },
  ];
  async function confirmDelete() {
    const ok = await confirm({ title: "Delete Ana Novak?", message: "Her notes and reminders will be deleted too.", confirmLabel: "Delete", destructive: true });
    if (ok) toast.undo("Ana Novak deleted", () => toast("Restored"));
  }
  return (
    <Section id="overlays" title="Overlays">
      <div className="grid gap-4 md:grid-cols-2">
        <Demo label="Sheet (bottom sheet < sm, dialog ≥ sm)">
          <div className="flex flex-wrap gap-2">
            <GlassButton variant="primary" onClick={() => openSheet("auto")}>
              Auto
            </GlassButton>
            <GlassButton onClick={() => openSheet("large")}>Large</GlassButton>
            <GlassButton onClick={() => openSheet("snap")}>Snap points</GlassButton>
          </div>
          <Sheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title="New note"
            description={sheet === "snap" ? "Drag between a peek and full height (phones)." : undefined}
            size={sheet === "large" ? "large" : "auto"}
            snapPoints={sheet === "snap" ? ["320px", 1] : undefined}
            cancel
            done="Save"
            onDone={() => new Promise<void>((r) => setTimeout(r, 600)).then(() => toast.success("Note saved"))}
          >
            <div className="space-y-3">
              <Field label="Title">
                <GlassInput value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="When">
                <DateField value="2026-10-14" onChange={() => {}} presets="past" />
              </Field>
              {sheet !== "auto" && <SkeletonText lines={8} />}
              <GlassButton variant="danger" className="w-full" onClick={() => void confirmDelete()}>
                Delete…
              </GlassButton>
            </div>
          </Sheet>
        </Demo>
        <Demo label="Dialog · confirm() · toast()">
          <div className="flex flex-wrap gap-2">
            <GlassButton onClick={() => setDialog(true)}>Dialog</GlassButton>
            <GlassButton variant="danger" onClick={() => void confirmDelete()}>
              confirm()
            </GlassButton>
            <GlassButton onClick={() => void confirm({ title: "Mark all as done?", confirmLabel: "Mark done" }).then((ok) => ok && toast.success("All done"))}>
              confirm (default)
            </GlassButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <GlassButton size="sm" variant="soft" onClick={() => toast({ title: "Reminder set", description: "Tue, 14 Oct · 09:00" })}>
              toast
            </GlassButton>
            <GlassButton size="sm" variant="soft" onClick={() => toast.success("Saved")}>
              success
            </GlassButton>
            <GlassButton size="sm" variant="soft" onClick={() => toast.error("Couldn't sync", { description: "You're offline — changes are queued." })}>
              error
            </GlassButton>
            <GlassButton size="sm" variant="soft" onClick={() => toast.undo("Note deleted", () => toast("Restored"))}>
              undo
            </GlassButton>
          </div>
          <Dialog
            open={dialog}
            onOpenChange={setDialog}
            title="Rename category"
            description="Categories group people on the globe and in lists."
            actions={
              <>
                <DialogClose render={<GlassButton variant="ghost" />}>Cancel</DialogClose>
                <GlassButton variant="primary" onClick={() => setDialog(false)}>
                  Save
                </GlassButton>
              </>
            }
          >
            <GlassInput defaultValue="Climbing" aria-label="Category name" />
          </Dialog>
        </Demo>
        <Demo label="Menu (action sheet on touch phones) · ActionSheet">
          <div className="flex flex-wrap items-center gap-2">
            <Menu trigger={<IconButton label="More" variant="glass" icon={<MoreHorizontal />} />} items={menuItems} title="Ana Novak" />
            <Menu trigger={<GlassButton>Open menu</GlassButton>} items={menuItems} align="start" />
            <GlassButton onClick={() => setActions(true)}>Action sheet</GlassButton>
          </div>
          <ActionSheet
            open={actions}
            onOpenChange={setActions}
            title="Ana Novak"
            message="Choose what to do"
            actions={[
              { label: "Call", icon: <Phone />, onSelect: () => toast("Calling…") },
              { label: "Email", icon: <Mail />, onSelect: () => toast("Composing…") },
              "separator",
              { label: "Delete", icon: <Trash2 />, destructive: true, onSelect: () => void confirmDelete() },
            ]}
          />
        </Demo>
        <Demo label="ContextMenu · Popover · ResponsivePopover">
          <ContextMenu items={menuItems} className="grid h-20 place-items-center rounded-md border-[0.5px] border-dashed border-hairline-strong text-subhead text-fg-3">
            Right-click or long-press here
          </ContextMenu>
          <div className="flex flex-wrap gap-2">
            <Popover trigger={<GlassButton>Popover</GlassButton>} title="Time zones" showTitle>
              <p className="text-subhead text-fg-2">Ana is in Maribor — it&apos;s the same time there.</p>
            </Popover>
            <Popover trigger={<GlassButton variant="plain">Hover info</GlassButton>} openOnHover title="Warmth">
              <p className="max-w-[240px] text-footnote text-fg-2">Warmth tracks how close you are; it drifts if you don&apos;t keep in touch.</p>
            </Popover>
            <ResponsivePopover trigger={<GlassButton>Pick a colour</GlassButton>} title="Colour">
              {(close) => (
                <div className="grid grid-cols-5 gap-3 p-1">
                  {PALETTE.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-label={p.label}
                      onClick={() => {
                        toast(p.label);
                        close();
                      }}
                      className="pressable size-10 rounded-full ring-[0.5px] ring-hairline"
                      style={{ background: p.cssVar }}
                    />
                  ))}
                </div>
              )}
            </ResponsivePopover>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------- Dates ---------- */

function DateSection() {
  const [due, setDue] = useState<string | null>(null);
  const [met, setMet] = useState<string | null>("2026-10-10");
  const [at, setAt] = useState<string | null>("2026-10-20");
  const [time, setTime] = useState<string | null>("09:00");
  const [cal, setCal] = useState<Date | null>(new Date(2026, 9, 14));
  const [bday, setBday] = useState<string | null>("1604-03-29");
  const today = toISODate(new Date(useNow()));
  return (
    <Section id="dates" title="Dates">
      <div className="grid gap-4 md:grid-cols-2">
        <Demo label="DateField">
          <Field label="Follow up" hint="Presets: followup · min today">
            <DateField value={due} onChange={setDue} presets="followup" min={today} clearable label="Follow up" placeholder="Pick a date" />
          </Field>
          <Field label="Met on" hint="Presets: past · max today">
            <DateField value={met} onChange={setMet} presets="past" max={today} label="Met on" />
          </Field>
          <Field label="Reminder" hint="withTime">
            <DateField value={at} onChange={setAt} withTime time={time} onTimeChange={setTime} presets="followup" label="Reminder" />
          </Field>
        </Demo>
        <Demo label="Calendar">
          <Calendar value={cal} onChange={setCal} />
        </Demo>
        <Demo label="TimePicker">
          <TimePicker value={time} onChange={setTime} clearable />
        </Demo>
        <Demo label="BirthdayPicker (year optional)">
          <BirthdayPicker value={bday} onChange={setBday} />
          <p className="text-footnote text-fg-3">
            Stored: <code className="font-mono">{bday ?? "null"}</code> · {formatBirthday(bday)}
          </p>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------- Lists ---------- */

function ListSection() {
  const [seenAt] = useState(() => new Date(Date.now() - 1000 * 60 * 42));
  const [loading, setLoading] = useState(true);
  const [digest, setDigest] = useState(true);
  return (
    <Section id="lists" title="Lists & states">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-6">
          <InsetGroup header="Contact" footer="Shown on Ana's card.">
            <ListRow icon={<Phone />} iconColor="var(--palette-green)" label="Phone" value="+386 40 123 456" onClick={() => toast("Calling…")} chevron />
            <ListRow icon={<Mail />} iconColor="var(--palette-sky)" label="Email" value="ana@example.com" href="#lists" />
            <ListRow icon={<MapPin />} iconColor="var(--palette-coral)" label="Lives in" value="Maribor" />
            <ListRow icon={<Cake />} iconColor="var(--palette-rose)" label="Birthday" description="Turns 31 in 3 weeks" value="7 Nov" />
          </InsetGroup>
          <InsetGroup header="Settings">
            <ListRow icon={<Bell />} label="Daily digest" accessory={<Switch aria-label="Daily digest" checked={digest} onCheckedChange={setDigest} />} />
            <ListRow leading={<Avatar name="Ana Novak" size={36} />} label="Ana Novak" description={<RelativeTime date={seenAt} />} chevron onClick={() => {}} />
            <ListRow label="Sign out" destructive onClick={() => toast("Signed out")} />
          </InsetGroup>
        </div>
        <div className="space-y-4">
          <Demo label="Avatars">
            <div className="flex flex-wrap items-center gap-2">
              {PEOPLE.slice(0, 6).map((p, i) => (
                <Avatar key={p.id} name={p.name} size={[28, 32, 40, 48, 56, 64][i]} />
              ))}
            </div>
          </Demo>
          <Demo label="Skeleton (fades in after 150ms)">
            <GlassButton size="sm" onClick={() => setLoading((l) => !l)}>
              {loading ? "Show content" : "Show skeleton"}
            </GlassButton>
            {loading ? (
              <div className="surface overflow-hidden rounded-lg">
                <SkeletonRows count={3} />
              </div>
            ) : (
              <InsetGroup>
                {PEOPLE.slice(0, 3).map((p) => (
                  <ListRow key={p.id} leading={<Avatar name={p.name} size={40} />} label={p.name} description={p.city} chevron onClick={() => {}} />
                ))}
              </InsetGroup>
            )}
            <div className="flex gap-3">
              <Skeleton className="size-12 rounded-md" />
              <SkeletonText lines={2} className="flex-1" />
            </div>
          </Demo>
          <GlassCard>
            <EmptyState
              icon={<Inbox />}
              title="No follow-ups"
              description="When you set a reminder for someone it shows up here."
              action={
                <GlassButton variant="primary" size="sm">
                  <Plus size={16} /> Add reminder
                </GlassButton>
              }
            />
          </GlassCard>
        </div>
      </div>
    </Section>
  );
}
