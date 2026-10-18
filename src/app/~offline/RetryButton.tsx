"use client";
import { RotateCw } from "lucide-react";
import { useEffect } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { reloadWhenOnline } from "@/lib/offline/reconnect";

/** Manual retry; the page also retries by itself once the network is back. */
export function RetryButton() {
  useEffect(() => reloadWhenOnline(window), []);

  return (
    <GlassButton variant="primary" onClick={() => window.location.reload()}>
      <RotateCw size={17} strokeWidth={2.3} aria-hidden /> Try again
    </GlassButton>
  );
}
