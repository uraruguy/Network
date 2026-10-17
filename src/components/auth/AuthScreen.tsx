import type { ReactNode } from "react";
import { GlassCard } from "@/components/glass/GlassCard";
import { Logo } from "@/components/shell/Logo";
import { cn } from "@/lib/utils";

export type AuthScreenProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Replaces the logo (e.g. a status icon on result screens). */
  icon?: ReactNode;
  children?: ReactNode;
  /** Quiet links under the card (sign out, back to sign in …). */
  footer?: ReactNode;
  className?: string;
};

/**
 * Shared frame for the sign-in surface and the e-mail confirm page: centered on the app's soft
 * background, logo + title, one floating glass card. Safe-area aware; works light and dark.
 */
export function AuthScreen({ title, subtitle, icon, children, footer, className }: AuthScreenProps) {
  return (
    <main className="relative grid min-h-dvh place-items-center px-4 pt-[calc(24px+var(--sat))] pb-[calc(24px+var(--sab))] sm:px-6">
      <div className="app-bg" aria-hidden />
      <div className={cn("w-full max-w-[400px]", className)}>
        <header className="mb-7 flex flex-col items-center gap-4 text-center">
          {icon ?? <Logo size={60} />}
          <div className="space-y-1.5">
            <h1 className="text-title1 text-balance text-fg">{title}</h1>
            {subtitle && <p className="mx-auto max-w-[34ch] text-subhead text-balance text-fg-2">{subtitle}</p>}
          </div>
        </header>
        {children && (
          <GlassCard strong className="rounded-xl p-5 sm:p-6">
            {children}
          </GlassCard>
        )}
        {footer && <div className="mt-6 flex flex-col items-center gap-1 text-center text-footnote text-fg-3">{footer}</div>}
      </div>
    </main>
  );
}

/** Round tinted status glyph for result screens (success / warning). */
export function StatusIcon({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "success" | "warning" | "danger" }) {
  const tones = {
    accent: "bg-accent-soft text-accent-text",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <div className={cn("grid size-[60px] place-items-center rounded-full [&_svg]:size-7", tones[tone])} aria-hidden>
      {children}
    </div>
  );
}
