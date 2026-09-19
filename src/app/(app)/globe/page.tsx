import { PageHeader } from "@/components/shell/PageHeader";
import { GlassCard } from "@/components/glass/GlassCard";

export const metadata = { title: "Globe" };

export default function GlobePage() {
  return (
    <>
      <PageHeader title="Globe" />
      <GlassCard>
        <p className="text-fg-2">Coming up next.</p>
      </GlassCard>
    </>
  );
}
