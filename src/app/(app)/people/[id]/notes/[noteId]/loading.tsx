"use client";
import { useParams } from "next/navigation";
import { NoteSkeleton } from "@/components/skeletons";

export default function Loading() {
  const { id } = useParams<{ id: string }>();
  return <NoteSkeleton personId={id} />;
}
