"use client";
import { ConnectedAppsSection } from "./ConnectedAppsSection";
import { SecuritySection } from "./SecuritySection";
import { SectionPage } from "../SettingsShell";

/**
 * Pages for the sections other tracks own: the Auth track builds <SecuritySection/>, the AI track
 * <ConnectedAppsSection/>. This file only gives them the settings chrome (title, back button).
 */
export function SecurityPage() {
  return (
    <SectionPage id="security" description="Passkeys, recovery codes, password and signed-in sessions.">
      <SecuritySection />
    </SectionPage>
  );
}

export function ConnectedAppsPage() {
  return (
    <SectionPage id="apps" description="Let Claude and other MCP clients read your network with a personal token or OAuth.">
      <ConnectedAppsSection />
    </SectionPage>
  );
}
