"use client";
import { RotateCw } from "lucide-react";
import { GlassButton } from "@/components/glass/GlassButton";

export function RetryButton() {
  return (
    <GlassButton variant="primary" onClick={() => window.location.reload()}>
      <RotateCw size={17} strokeWidth={2.3} aria-hidden /> Try again
    </GlassButton>
  );
}
