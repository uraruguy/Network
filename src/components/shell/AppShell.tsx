"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";
import { OnlineIndicator } from "./OnlineIndicator";
import { Logo } from "./Logo";
import { Hydrated } from "./Hydrated";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isGlobe = pathname.startsWith("/globe") || pathname.startsWith("/graph");

  return (
    <div className="flex min-h-dvh">
      <div className="app-bg" aria-hidden />

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-[236px] flex-col p-4">
        <div className="glass specular flex h-full flex-col rounded-[var(--r-xl)] p-3">
          <Link href="/today" className="flex items-center gap-2.5 px-2 pt-2 pb-5">
            <Logo size={30} />
            <span className="text-[17px] font-semibold tracking-tight">The Network</span>
          </Link>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href) || (item.href === "/globe" && pathname.startsWith("/graph"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "pressable relative flex h-11 items-center gap-3 rounded-[14px] px-3 text-[15px] font-medium",
                    active ? "text-accent-strong" : "text-fg-2 hover:text-fg hover:bg-fg/4",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-[14px] bg-accent-soft"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <item.icon size={20} strokeWidth={active ? 2.4 : 2} className="relative" />
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto px-2 pb-1">
            <OnlineIndicator />
          </div>
        </div>
      </aside>

      {/* Content */}
      <main
        className={cn(
          "min-w-0 flex-1 lg:pl-[236px]",
          isGlobe ? "" : "pb-[calc(84px+var(--sab))] lg:pb-8",
        )}
      >
        <div className={cn(isGlobe ? "" : "mx-auto w-full max-w-[1100px] px-4 sm:px-6 lg:px-10 pt-[calc(12px+var(--sat))] lg:pt-8")}>
          <Hydrated>{children}</Hydrated>
        </div>
      </main>

      {/* Mobile tab bar */}
      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(10px,var(--sab))]">
        <div className="glass-strong specular mx-auto flex h-[64px] max-w-[520px] items-center justify-around rounded-[28px] px-2">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href) || (item.href === "/globe" && pathname.startsWith("/graph"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "pressable relative flex h-12 w-[62px] flex-col items-center justify-center gap-0.5 rounded-[18px]",
                  active ? "text-accent-strong" : "text-fg-3",
                )}
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="tab-active"
                    className="absolute inset-0 rounded-[18px] bg-accent-soft"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <item.icon size={22} strokeWidth={active ? 2.4 : 2} className="relative" />
                <span className="relative text-[10.5px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
