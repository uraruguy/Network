"use client";
import { useEffect } from "react";
import { applyTheme, subscribeTheme } from "@/lib/theme";

/**
 * Keeps `.dark`, `color-scheme` and `<meta name="theme-color">` in sync with the theme
 * preference and the live OS appearance. Mount once (Providers). Renders nothing.
 */
export function ThemeSync() {
  useEffect(() => {
    applyTheme();
    return subscribeTheme(() => {});
  }, []);
  return null;
}
