import { Compass } from "lucide-react";
import { LinkButton } from "@/components/shell/LinkButton";
import { StatusCard, StatusScreen } from "@/components/shell/StatusCard";
import { TAB } from "@/components/shell/transitions";

/** `notFound()` inside an (app) screen — shown within the shell. */
export default function NotFound() {
  return (
    <StatusScreen>
      <StatusCard
        tone="neutral"
        icon={<Compass strokeWidth={2} />}
        title="Nothing here"
        actions={
          <>
            <LinkButton href="/people" transitionTypes={TAB}>
              People
            </LinkButton>
            <LinkButton href="/today" transitionTypes={TAB} variant="primary">
              Go to Today
            </LinkButton>
          </>
        }
      >
        This page doesn&apos;t exist, or what it showed has been deleted.
      </StatusCard>
    </StatusScreen>
  );
}
