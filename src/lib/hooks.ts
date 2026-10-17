"use client";
/**
 * v1 hook entry point — kept for existing imports. New code should import from
 * `@/lib/clock` (useNow) and `@/lib/theme` (useThemePreference / useResolvedTheme).
 */
import { useThemePreference } from "@/lib/theme";

export { useNow } from "@/lib/clock";

/** Theme preference persisted in localStorage; applies the `.dark` class immediately. */
export function useTheme() {
  return useThemePreference();
}
