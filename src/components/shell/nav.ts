import { Globe2, MessageCircle, Settings, Sun, Users } from "lucide-react";

export const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/people", label: "People", icon: Users },
  { href: "/globe", label: "Globe", icon: Globe2 },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
