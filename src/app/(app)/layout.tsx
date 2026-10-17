import { AppShell } from "@/components/shell/AppShell";

/**
 * No auth check here on purpose: the proxy gates every page request and the API re-verifies every
 * call, so the shell stays static and prefetchable (and opens instantly offline).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
