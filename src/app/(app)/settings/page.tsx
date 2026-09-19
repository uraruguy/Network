import { PageHeader } from "@/components/shell/PageHeader";
import { GlassCard } from "@/components/glass/GlassCard";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <GlassCard>
        <p className="text-fg-2">Coming up next.</p>
      </GlassCard>
    </>
  );
}
