import { notFound } from "next/navigation";
import { isSectionId, SECTION_IDS, SECTIONS } from "@/components/settings/nav";
import { SettingsSection } from "@/components/settings/SettingsSection";

export const dynamicParams = false;

export function generateStaticParams() {
  return SECTION_IDS.map((section) => ({ section }));
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return { title: isSectionId(section) ? `${SECTIONS[section].title ?? SECTIONS[section].label} · Settings` : "Settings" };
}

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isSectionId(section)) notFound();
  return <SettingsSection id={section} />;
}
