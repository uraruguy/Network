import { Briefcase, GraduationCap, Handshake, Heart, Rocket, Sparkles, Star, TrendingUp, User, Users, type LucideProps } from "lucide-react";

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  "graduation-cap": GraduationCap,
  heart: Heart,
  handshake: Handshake,
  "trending-up": TrendingUp,
  briefcase: Briefcase,
  rocket: Rocket,
  user: User,
  users: Users,
  star: Star,
  sparkles: Sparkles,
};

export const CATEGORY_ICON_NAMES = Object.keys(ICONS);

export function CategoryIcon({ name, ...rest }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon strokeWidth={2.4} {...rest} />;
}
