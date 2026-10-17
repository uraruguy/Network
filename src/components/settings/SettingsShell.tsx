"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isSectionId, SECTIONS, type SectionId } from "./nav";
import { SettingsSidebar } from "./SettingsNav";

/**
 * Settings layout. Phones (< lg): each route is a full screen — the index at /settings, a section
 * with a back button at /settings/<id>. Desktop (≥ lg): two panes like macOS System Settings — the
 * sidebar stays put and only the detail pane changes.
 */
export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const segment = pathname.split("/")[2] ?? "";
  const active = isSectionId(segment) ? segment : null;
  return (
    <div className="lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <aside className="sticky top-8 hidden lg:block">
        <SettingsSidebar active={active} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Header + body of one settings section (back button on phones). */
export function SectionPage({ id, description, actions, children, className }: { id: SectionId; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  const s = SECTIONS[id];
  return (
    <div className={cn("mx-auto w-full max-w-[680px] lg:mx-0", className)}>
      <div className="-ml-2 mb-1 lg:hidden">
        <Link href="/settings" className="pressable inline-flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1 text-body text-accent-text hover:bg-accent-soft">
          <ChevronLeft size={24} strokeWidth={2.4} aria-hidden />
          Settings
        </Link>
      </div>
      <header className="mb-5 flex items-end justify-between gap-3 lg:mb-6">
        <div className="min-w-0">
          <h1 className="text-title1 sm:text-large-title lg:text-title1">{s.title ?? s.label}</h1>
          {description && <p className="mt-1.5 text-subhead text-fg-2">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="space-y-7">{children}</div>
    </div>
  );
}
