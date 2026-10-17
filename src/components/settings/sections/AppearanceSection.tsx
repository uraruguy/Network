"use client";
import { Moon, Sun, SunMoon } from "lucide-react";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useResolvedTheme, useThemePreference, type ThemePreference } from "@/lib/theme";
import { SectionPage } from "../SettingsShell";

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "Auto", icon: <SunMoon /> },
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
];

export function AppearanceSection() {
  const [pref, setPref] = useThemePreference();
  const resolved = useResolvedTheme();
  return (
    <SectionPage id="appearance">
      <InsetGroup
        header="Theme"
        footer={
          pref === "system"
            ? `Auto follows this device's light or dark setting — it's ${resolved} right now. Saved on this device only.`
            : "Saved on this device only; your other devices keep their own choice."
        }
      >
        <div className="p-3">
          <SegmentedControl aria-label="Theme" size="lg" fullWidth value={pref} onChange={setPref} items={OPTIONS} />
        </div>
      </InsetGroup>
    </SectionPage>
  );
}
