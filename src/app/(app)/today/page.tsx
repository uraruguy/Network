import { PageHeader } from "@/components/shell/PageHeader";
import { GlassCard } from "@/components/glass/GlassCard";

export const metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" />
      <GlassCard>
        <p className="text-fg-2">Coming up next.</p>
      </GlassCard>
    </>
  );
}
