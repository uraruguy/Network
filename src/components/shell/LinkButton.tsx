"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonVariants } from "@/components/glass/GlassButton";
import { cn } from "@/lib/utils";

type Props = ComponentProps<typeof Link> & {
  variant?: "primary" | "glass" | "surface" | "soft" | "plain" | "ghost";
  size?: "sm" | "md" | "lg";
  /** A plain <a> (full page load) instead of a client-side Link — e.g. from offline/error pages. */
  hard?: boolean;
};

/** A link styled as a GlassButton (usable from server components, unlike `buttonVariants`). */
export function LinkButton({ variant = "surface", size = "md", hard, className, href, children, ...rest }: Props) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (hard) {
    return (
      <a href={typeof href === "string" ? href : String(href.pathname ?? "/")} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}
