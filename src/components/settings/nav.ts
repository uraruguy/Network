import { Bell, Blocks, CircleUserRound, Database, ListChecks, Palette, PlugZap, Puzzle, ShieldCheck, Shapes, Tag, type LucideIcon } from "lucide-react";

/**
 * Settings sections: one registry drives the phone index, the desktop sidebar, search and the
 * `/settings/[section]` route (unknown ids 404).
 */
export const SECTION_IDS = ["profile", "appearance", "digest", "categories", "activities", "tags", "connections", "apps", "security", "data", "setup"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export type SectionMeta = {
  id: SectionId;
  label: string;
  /** Title on the detail page when it differs from the list label. */
  title?: string;
  icon: LucideIcon;
  /** Tile colour (CSS value — palette variables keep light/dark in step). */
  color: string;
  /** Extra words the settings search matches. */
  keywords: string;
};

export const SECTIONS: Record<SectionId, SectionMeta> = {
  profile: { id: "profile", label: "You", title: "Your profile", icon: CircleUserRound, color: "var(--accent-fill)", keywords: "name profile home base city timezone time zone account email" },
  appearance: { id: "appearance", label: "Appearance", icon: Palette, color: "var(--palette-amber)", keywords: "theme dark light mode auto colour color" },
  digest: { id: "digest", label: "Daily digest", icon: Bell, color: "var(--palette-coral)", keywords: "email e-mail reminders follow up morning notification hour schedule preview" },
  categories: { id: "categories", label: "Categories", icon: Shapes, color: "var(--palette-violet)", keywords: "groups colours colors icons globe" },
  activities: { id: "activities", label: "Activities", icon: Blocks, color: "var(--palette-green)", keywords: "hobbies sports things together emoji order" },
  tags: { id: "tags", label: "Tags", icon: Tag, color: "var(--palette-rose)", keywords: "labels merge rename" },
  connections: { id: "connections", label: "AI & e-mail", title: "Connections", icon: PlugZap, color: "var(--palette-teal)", keywords: "ai anthropic openrouter claude api key model email e-mail resend smtp mail test connection" },
  apps: { id: "apps", label: "Connected apps", icon: Puzzle, color: "var(--palette-sky)", keywords: "mcp tokens claude desktop oauth api access integrations" },
  security: { id: "security", label: "Security", title: "Security", icon: ShieldCheck, color: "var(--palette-indigo)", keywords: "passkey password recovery codes sessions sign in two factor" },
  data: { id: "data", label: "Your data", icon: Database, color: "var(--warm-archive)", keywords: "export import json backup apple notes download" },
  setup: { id: "setup", label: "Setup checklist", icon: ListChecks, color: "var(--accent-fill)", keywords: "install self host status migrations health ready" },
};

export type SectionGroup = { header?: string; ids: SectionId[] };

/** List order (the profile row and the setup banner are rendered separately at the top). */
export const GROUPS: SectionGroup[] = [
  { ids: ["appearance", "digest"] },
  { header: "Organize", ids: ["categories", "activities", "tags"] },
  { header: "Connections", ids: ["connections", "apps"] },
  { header: "Privacy & security", ids: ["security", "data"] },
];

export const isSectionId = (s: string): s is SectionId => (SECTION_IDS as readonly string[]).includes(s);

export const sectionHref = (id: SectionId) => `/settings/${id}`;
