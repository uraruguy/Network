"use client";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { SearchField } from "@/components/ui/SearchField";
import { matchesQuery } from "@/components/ui/search";
import { confirm } from "@/components/ui/confirm";
import { useReadyData } from "@/lib/offline/useCacheReady";
import { useProfile } from "@/lib/queries/settings";
import { cn } from "@/lib/utils";
import { GROUPS, SECTIONS, SECTION_IDS, sectionHref, type SectionId } from "./nav";
import { IconTile } from "./parts/IconTile";
import { signOut } from "./signOut";
import { useSectionValues } from "./useSectionValues";

function useSearch() {
  const [query, setQuery] = useState("");
  const matches = query.trim() ? SECTION_IDS.filter((id) => matchesQuery(`${SECTIONS[id].label} ${SECTIONS[id].title ?? ""} ${SECTIONS[id].keywords}`, query)) : null;
  return { query, setQuery, matches };
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    if (!(await confirm({ title: "Sign out?", message: "You'll need your password and passkey to sign back in.", confirmLabel: "Sign out", destructive: true }))) return;
    await signOut(qc);
  };
}

/* ---------- phone: grouped index ---------- */

/** iOS Settings index: account card, setup banner, grouped rows, sign out. */
export function SettingsIndexList() {
  const profile = useReadyData(useProfile());
  const values = useSectionValues();
  const { query, setQuery, matches } = useSearch();
  const onSignOut = useSignOut();
  const name = profile?.displayName || "Your name";

  return (
    <div className="space-y-6">
      <SearchField value={query} onChange={setQuery} placeholder="Search settings" aria-label="Search settings" />

      {matches ? (
        <InsetGroup header={matches.length ? "Results" : undefined}>
          {matches.length ? (
            matches.map((id) => <SectionRow key={id} id={id} value={values[id]} />)
          ) : (
            <p className="px-4 py-6 text-center text-subhead text-fg-3">No settings match “{query.trim()}”.</p>
          )}
        </InsetGroup>
      ) : (
        <>
          <InsetGroup>
            <ListRow
              href={sectionHref("profile")}
              leading={<Avatar name={profile?.displayName || profile?.email || "?"} size={56} />}
              label={<span className="text-title3 font-semibold">{name}</span>}
              description={profile?.email ?? " "}
              className="py-1.5"
            />
          </InsetGroup>

          {values.setupRemaining !== null && values.setupRemaining > 0 && (
            <InsetGroup>
              <ListRow
                href={sectionHref("setup")}
                icon={<SECTIONS.setup.icon />}
                iconColor={SECTIONS.setup.color}
                label="Finish setting up"
                description="Get everything working"
                accessory={<CountBadge count={values.setupRemaining} />}
                chevron
              />
            </InsetGroup>
          )}

          {GROUPS.map((g, i) => (
            <InsetGroup key={i} header={g.header}>
              {g.ids.map((id) => (
                <SectionRow key={id} id={id} value={values[id]} />
              ))}
            </InsetGroup>
          ))}

          {values.setupRemaining === 0 && (
            <InsetGroup>
              <SectionRow id="setup" value="All set" />
            </InsetGroup>
          )}

          <InsetGroup>
            <ListRow label={<span className="block text-center">Sign out</span>} destructive onClick={onSignOut} className="justify-center" />
          </InsetGroup>
        </>
      )}
    </div>
  );
}

function SectionRow({ id, value }: { id: SectionId; value?: ReactNode }) {
  const s = SECTIONS[id];
  const isNode = value !== undefined && value !== null && typeof value === "object";
  return <ListRow href={sectionHref(id)} icon={<s.icon />} iconColor={s.color} label={s.label} {...(isNode ? { accessory: value } : { value })} chevron />;
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="grid h-6 min-w-6 place-items-center rounded-full bg-danger-fill px-1.5 text-caption font-semibold text-white tabular-nums" aria-label={`${count} left`}>
      {count}
    </span>
  );
}

/* ---------- desktop: sidebar ---------- */

/** macOS System Settings sidebar: search, account, sections, sign out. */
export function SettingsSidebar({ active }: { active: SectionId | null }) {
  const profile = useReadyData(useProfile());
  const values = useSectionValues();
  const { query, setQuery, matches } = useSearch();
  const onSignOut = useSignOut();

  return (
    <nav aria-label="Settings" className="surface flex max-h-[calc(100dvh-64px)] flex-col overflow-hidden rounded-lg">
      <div className="p-2.5 pb-1.5">
        <SearchField value={query} onChange={setQuery} placeholder="Search" aria-label="Search settings" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        {matches ? (
          <ul className="space-y-0.5 pt-1">
            {matches.map((id) => (
              <SidebarItem key={id} id={id} active={active === id} />
            ))}
            {!matches.length && <li className="px-3 py-4 text-footnote text-fg-3">No matches</li>}
          </ul>
        ) : (
          <>
            <Link
              href={sectionHref("profile")}
              aria-current={active === "profile" ? "page" : undefined}
              className={cn(
                "pressable my-1 flex min-h-14 items-center gap-3 rounded-sm px-2 py-1.5 outline-offset-0",
                active === "profile" ? "bg-accent-soft" : "hover:bg-fill-1",
              )}
            >
              <Avatar name={profile?.displayName || profile?.email || "?"} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-subhead font-semibold text-fg">{profile?.displayName || "Your name"}</span>
                <span className="block truncate text-caption text-fg-3">{profile?.email ?? " "}</span>
              </span>
            </Link>

            {values.setupRemaining !== null && values.setupRemaining > 0 && (
              <Link
                href={sectionHref("setup")}
                aria-current={active === "setup" ? "page" : undefined}
                className={cn("pressable mb-1 flex min-h-11 items-center gap-2.5 rounded-sm px-2 outline-offset-0", active === "setup" ? "bg-accent-soft" : "hover:bg-fill-1")}
              >
                <IconTile icon={SECTIONS.setup.icon} color={SECTIONS.setup.color} size={28} />
                <span className="min-w-0 flex-1 truncate text-subhead text-fg">Finish setting up</span>
                <CountBadge count={values.setupRemaining} />
              </Link>
            )}

            {GROUPS.map((g, i) => (
              <div key={i} className="pt-2">
                {g.header && <p className="px-2 pt-1 pb-1 text-caption font-semibold text-fg-3">{g.header}</p>}
                <ul className="space-y-0.5">
                  {g.ids.map((id) => (
                    <SidebarItem key={id} id={id} active={active === id} attention={values.attention[id]} />
                  ))}
                </ul>
              </div>
            ))}
            {values.setupRemaining === 0 && (
              <ul className="space-y-0.5 pt-2">
                <SidebarItem id="setup" active={active === "setup"} />
              </ul>
            )}
          </>
        )}
      </div>
      <div className="border-t-[0.5px] border-separator p-2">
        <button type="button" onClick={onSignOut} className="pressable flex min-h-11 w-full items-center gap-2.5 rounded-sm px-2 text-left text-subhead text-danger hover:bg-danger-soft">
          <LogOut size={18} aria-hidden className="mx-[5px]" />
          Sign out
        </button>
      </div>
    </nav>
  );
}

function SidebarItem({ id, active, attention }: { id: SectionId; active: boolean; attention?: "error" | "warn" }) {
  const s = SECTIONS[id];
  return (
    <li>
      <Link
        href={sectionHref(id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "pressable group flex min-h-11 items-center gap-2.5 rounded-sm px-2 outline-offset-0 transition-colors",
          active ? "bg-accent-soft text-accent-text" : "text-fg hover:bg-fill-1",
        )}
      >
        <IconTile icon={s.icon} color={s.color} size={28} />
        <span className={cn("min-w-0 flex-1 truncate text-subhead", active && "font-semibold")}>{s.label}</span>
        {attention ? (
          <span className={cn("mr-1 size-2 shrink-0 rounded-full", attention === "error" ? "bg-danger" : "bg-warning")} role="img" aria-label={attention === "error" ? "Needs attention" : "Not finished"} />
        ) : (
          <ChevronRight size={15} className="shrink-0 text-fg-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        )}
      </Link>
    </li>
  );
}
