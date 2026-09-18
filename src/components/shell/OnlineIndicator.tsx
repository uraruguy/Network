"use client";
import { useEffect, useState } from "react";
import { useIsRestoring } from "@tanstack/react-query";

export function OnlineIndicator() {
  const [online, setOnline] = useState(true);
  const restoring = useIsRestoring();
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <div className="flex items-center gap-2 text-[12px] text-fg-3">
      <span className={online ? "h-2 w-2 rounded-full bg-success" : "h-2 w-2 rounded-full bg-warm-dormant"} />
      {restoring ? "Restoring…" : online ? "Synced" : "Offline — changes will sync"}
    </div>
  );
}
