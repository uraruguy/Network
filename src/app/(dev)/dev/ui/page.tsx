import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Playground } from "./Playground";

export const metadata: Metadata = { title: "UI playground" };

/** Design-system playground — every primitive and token. Development only. */
export default function UiPlaygroundPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Playground />;
}
