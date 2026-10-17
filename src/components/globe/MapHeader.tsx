"use client";
import { Globe2, Share2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { forwardRef, useEffect, type ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/utils";

type View = "globe" | "graph";

/** Query params shared by both views (people filters); the globe's `city` selection stays behind. */
const SHARED = ["q", "cat", "w", "act", "tag"];

function carryParams(): string {
  if (typeof window === "undefined") return "";
  const from = new URLSearchParams(window.location.search);
  const to = new URLSearchParams();
  for (const k of SHARED) {
    const v = from.get(k);
    if (v) to.set(k, v);
  }
  const s = to.toString();
  return s ? `?${s}` : "";
}

/** Globe | Graph switch — keeps the active filters when hopping between the two maps. */
export function ViewSwitch({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const view: View = pathname.startsWith("/graph") ? "graph" : "globe";

  useEffect(() => {
    router.prefetch(view === "globe" ? "/graph" : "/globe");
  }, [router, view]);

  return (
    <div className={cn("glass-map specular pointer-events-auto rounded-full p-1", className)}>
      <SegmentedControl<View>
        aria-label="Map view"
        value={view}
        onChange={(v) => v !== view && router.push(`/${v}${carryParams()}`)}
        items={[
          { value: "globe", label: <span className="max-sm:sr-only">Globe</span>, icon: <Globe2 />, ariaLabel: "Globe" },
          { value: "graph", label: <span className="max-sm:sr-only">Graph</span>, icon: <Share2 />, ariaLabel: "Graph" },
        ]}
      />
    </div>
  );
}

type MapHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  /** Rendered under the title row (filters, chips). */
  children?: ReactNode;
  className?: string;
};

/**
 * Floating header over the globe / graph: title + live counts on the left, the view switch on
 * the right, filters underneath. Safe-area aware; only its controls take pointer events.
 */
export const MapHeader = forwardRef<HTMLDivElement, MapHeaderProps>(function MapHeader({ title, subtitle, children, className }, ref) {
  return (
    <div ref={ref} className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[calc(10px+var(--sat))] sm:px-4 lg:px-6 lg:pt-6", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="glass-map specular pointer-events-auto min-w-0 rounded-lg px-4 py-2">
          <h1 className="text-title3 leading-tight text-fg">{title}</h1>
          {subtitle && <p className="truncate text-footnote text-fg-2 tabular-nums">{subtitle}</p>}
        </div>
        <ViewSwitch />
      </div>
      {children && <div className="mt-2 flex flex-col items-start gap-2">{children}</div>}
    </div>
  );
});
