import { PageHeader } from "@/components/shell/PageHeader";
import { GlassCard } from "@/components/glass/GlassCard";

export const metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <>
      <PageHeader title="Chat" />
      <GlassCard>
        <p className="text-fg-2">Coming up next.</p>
      </GlassCard>
    </>
  );
}
