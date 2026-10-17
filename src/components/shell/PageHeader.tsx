"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NAV_BACK } from "./transitions";

export type PageHeaderProps = {
  /** Page title (the <h1>): large title, or the bar title in `inline` mode. */
  title: ReactNode;
  /** Line under the large title. */
  subtitle?: ReactNode;
  /** Small line above the large title (e.g. today's date). */
  eyebrow?: ReactNode;
  /** Trailing nav-bar buttons (IconButton / GlassButton). Stay visible while scrolling. */
  actions?: ReactNode;
  /** iOS back button in the nav bar; animates with the `nav-back` transition. */
  back?: { href: string; label: string };
  /** Title shown in the compact bar once the large title scrolls away (default: `title`). */
  compactTitle?: ReactNode;
  /**
   * `large` (default): iOS large title that collapses into the bar on scroll.
   * `inline`: no large title — the title sits in the bar from the start (detail screens).
   */
  display?: "large" | "inline";
  className?: string;
};

/**
 * iOS-style navigation header. Renders siblings into the page:
 *  1. a sticky nav bar (back button · compact title · actions) that is transparent at the top
 *     and becomes a blurred scroll-edge bar once content scrolls under it;
 *  2. in `large` mode, the large title block (eyebrow · title · subtitle), whose compact copy
 *     fades into the bar when it scrolls away (IntersectionObserver sentinel → data-scrolled).
 *
 * Put it first in the page, directly inside the page's root element (not inside a short wrapper,
 * or the bar can only stick within that wrapper). The bar pulls itself up into the shell's top
 * padding so it sits under the status bar / at the top of the content column.
 */
export function PageHeader({ title, subtitle, eyebrow, actions, back, compactTitle, display = "large", className }: PageHeaderProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const inline = display === "inline";

  useEffect(() => {
    const bar = barRef.current;
    const sentinel = sentinelRef.current;
    if (!bar || !sentinel || typeof IntersectionObserver === "undefined") return;
    const height = bar.offsetHeight;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Past the sentinel once it has gone under the bar (not when it's below the fold).
        setScrolled(!entry.isIntersecting && entry.boundingClientRect.top < height);
      },
      { rootMargin: `-${height}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  const sentinel = <div ref={sentinelRef} aria-hidden className="page-title-sentinel" />;

  return (
    <>
      <div ref={barRef} className="page-bar" data-scrolled={scrolled ? "" : undefined} data-inline={inline ? "" : undefined}>
        <div className="page-bar-bg" aria-hidden />
        <div className="page-bar-row">
          <div className="flex min-w-0 flex-1 basis-0 items-center">
            {back && (
              <Link
                href={back.href}
                transitionTypes={NAV_BACK}
                className="pressable -ml-2 inline-flex h-11 max-w-full items-center gap-0.5 rounded-full pr-3 pl-1 text-body text-accent-text [@media(hover:hover)]:hover:bg-accent-soft"
              >
                <ChevronLeft size={26} strokeWidth={2.2} className="shrink-0" aria-hidden />
                <span className="truncate">{back.label}</span>
              </Link>
            )}
          </div>
          {inline ? (
            <h1 className={cn("page-bar-title truncate text-headline text-fg", className)}>{title}</h1>
          ) : (
            <div className="page-bar-title truncate text-headline text-fg" aria-hidden>
              {compactTitle ?? title}
            </div>
          )}
          <div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-2">{actions}</div>
        </div>
      </div>
      {inline ? (
        sentinel
      ) : (
        <>
          <header className={cn("page-title-block", className)}>
            {eyebrow && <div className="mb-0.5 text-footnote font-semibold tracking-[0.02em] text-fg-3 uppercase">{eyebrow}</div>}
            <h1 className="text-title1 text-balance text-fg sm:text-large-title">{title}</h1>
            {subtitle && <div className="mt-1 text-subhead text-fg-2">{subtitle}</div>}
          </header>
          {sentinel}
        </>
      )}
    </>
  );
}
