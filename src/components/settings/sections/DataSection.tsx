"use client";
import { Download, FileUp, Users } from "lucide-react";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { toast } from "@/components/ui/Toast";
import { useStats } from "@/lib/queries/misc";
import { useTaxonomy } from "@/lib/queries/taxonomy";
import { SectionPage } from "../SettingsShell";

function download() {
  // A plain navigation keeps the browser's own download UI (and works for large exports).
  const a = document.createElement("a");
  a.href = "/api/export";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast({ title: "Preparing your export…", description: "The JSON file downloads in a moment." });
}

export function DataSection() {
  const { data: stats } = useStats();
  const { data: taxonomy } = useTaxonomy();
  return (
    <SectionPage id="data" description="Everything you put in is yours. Export it any time — nothing is locked in.">
      {stats && (
        <InsetGroup header="In your network">
          <ListRow icon={<Users />} label="People" value={stats.people} />
          <ListRow label="Cities" value={stats.cities} />
          {taxonomy && <ListRow label="Categories · activities · tags" value={`${taxonomy.categories.length} · ${taxonomy.activities.length} · ${taxonomy.tags.length}`} />}
        </InsetGroup>
      )}

      <InsetGroup header="Export" footer="One JSON file with people, notes, reminders, categories, activities, tags and places.">
        <ListRow icon={<Download />} iconColor="var(--palette-teal)" label="Export everything" description="JSON" onClick={download} chevron />
      </InsetGroup>

      <InsetGroup header="Import" footer="Bring in Apple Notes exports or pasted text; you review every person before anything is saved.">
        <ListRow icon={<FileUp />} iconColor="var(--palette-sky)" label="Import notes" href="/import" />
      </InsetGroup>
    </SectionPage>
  );
}
