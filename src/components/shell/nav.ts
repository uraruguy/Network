import { Globe2, MessageCircle, Settings, Sun, Users, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other path prefixes that light up this tab (e.g. /graph is the Globe tab's second view). */
  also?: readonly string[];
};

export const NAV: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/people", label: "People", icon: Users },
  { href: "/globe", label: "Globe", icon: Globe2, also: ["/graph"] },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Index of the tab that owns `pathname`, or -1 (e.g. /import). */
export function activeNavIndex(pathname: string): number {
  return NAV.findIndex((item) => under(pathname, item.href) || item.also?.some((p) => under(pathname, p)));
}

/** Routes drawn edge to edge (no content column, no padding). */
export function isFullBleed(pathname: string): boolean {
  return under(pathname, "/globe") || under(pathname, "/graph");
}

/** Routes that take the whole screen on phones: the tab bar slides away. */
export function hidesTabBar(pathname: string): boolean {
  return /^\/people\/[^/]+\/notes\/[^/]+$/.test(pathname);
}
