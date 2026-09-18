import { PageHeader } from "@/components/shell/PageHeader";
import { GlassCard } from "@/components/glass/GlassCard";

export const metadata = { title: "Utoday" };

export default function UtodayPage() {
  return (
    <>
      <PageHeader title="Utoday" />
      <GlassCard>
        <p className="text-fg-2">Coming up next.</p>
      </GlassCard>
    </>
  );
}
