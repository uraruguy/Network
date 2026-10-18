"use client";
import "@/app/transitions.css";
import "./shell.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { PasskeyPrompt } from "@/components/auth/PasskeyPrompt";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { QuickAddPersonHost } from "@/components/people/QuickAddPersonSheet";
import { NAV, activeNavIndex, hidesTabBar, isFullBleed } from "./nav";
import { SyncStatus } from "./SyncStatus";
import { PageTransition, TAB } from "./transitions";
import { useKeyboardInset } from "./useKeyboardInset";

/**
 * The app frame: ambient background, sidebar (≥lg) / floating tab bar (<lg), sync status,
 * passkey prompt, and the page transition boundary around every page.
 *
 * Renders on the server: nothing here waits for data or auth, so every (app) route stays static
 * and prefetchable and the shell paints instantly (also offline from the SW cache).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeNavIndex(pathname);
  const fullBleed = isFullBleed(pathname);
  const tabBarHidden = hidesTabBar(pathname);
  useKeyboardInset();

  return (
    <div className="app-shell" data-tabbar-hidden={tabBarHidden ? "" : undefined}>
      <div className="app-bg" aria-hidden />
      <a href="#content" className="skip-link">
        Skip to content
      </a>

      <Sidebar active={active} />

      <main id="content" className="min-w-0 flex-1 overflow-x-clip lg:pl-[var(--sidebar-w)]">
        {/* key: each navigation is an exit + enter pair (see PageTransition). */}
        <PageTransition key={pathname} className={fullBleed ? "page page-bleed" : "page page-column"}>
          {children}
        </PageTransition>
      </main>

      <TabBar active={active} hidden={tabBarHidden} />
      <SyncStatus variant="floating" className="lg:hidden" />
      {/* App-wide quick add: ⌘N / N, ?new=1 (People track) */}
      <QuickAddPersonHost />
      <PasskeyPrompt />
    </div>
  );
}

function Sidebar({ active }: { active: number }) {
  return (
    <aside className="sidebar fixed inset-y-0 left-0 z-[var(--z-chrome)] hidden w-[var(--sidebar-w)] p-4 lg:block" aria-label="Sidebar">
      <div className="glass specular flex h-full flex-col rounded-xl p-3">
        <Link href="/today" transitionTypes={TAB} className="flex items-center gap-2.5 rounded-sm px-2 pt-2 pb-5">
          <Logo size={30} />
          <span className="text-headline text-fg">The Network</span>
        </Link>
        <nav
          aria-label="Primary"
          className="nav-list relative flex flex-col gap-1"
          data-active={active >= 0 ? "" : undefined}
          style={{ "--i": Math.max(active, 0) } as CSSProperties}
        >
          <span aria-hidden className="nav-pill" />
          {NAV.map((item, i) => {
            const on = i === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                transitionTypes={TAB}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "pressable relative z-[1] flex h-11 items-center gap-3 rounded-sm px-3 text-subhead font-medium",
                  on ? "text-accent-text" : "text-fg-2 hover:bg-fill-1 hover:text-fg",
                )}
              >
                <item.icon size={20} strokeWidth={on ? 2.4 : 2} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 pb-1">
          <SyncStatus />
        </div>
      </div>
    </aside>
  );
}

function TabBar({ active, hidden }: { active: number; hidden: boolean }) {
  return (
    <nav aria-label="Primary" className="tab-bar fixed inset-x-0 bottom-0 z-[var(--z-chrome)] px-4 lg:hidden" data-hidden={hidden ? "" : undefined} inert={hidden}>
      <div
        className="tab-list glass-thick specular relative mx-auto flex h-[62px] max-w-[440px] items-stretch rounded-full p-1"
        data-active={active >= 0 ? "" : undefined}
        style={{ "--i": Math.max(active, 0), "--n": NAV.length } as CSSProperties}
      >
        <span aria-hidden className="tab-pill" />
        {NAV.map((item, i) => {
          const on = i === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              transitionTypes={TAB}
              aria-current={on ? "page" : undefined}
              className={cn(
                "pressable relative z-[1] flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full",
                on ? "text-accent-text" : "text-fg-3",
              )}
            >
              <item.icon size={22} strokeWidth={on ? 2.3 : 1.9} aria-hidden />
              <span className="text-caption2 font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
