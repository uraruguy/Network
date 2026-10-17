"use client";
import { Globe2, House, Minus, Plus, Route } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip, TooltipProvider } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

type Props = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHome: (() => void) | null;
  onPlanet: () => void;
  arcs: boolean;
  onArcsChange: ((on: boolean) => void) | null;
  className?: string;
};

/** Apple-Maps-style floating capsules: zoom ± · home · whole planet · arcs from home. */
export function GlobeControls({ onZoomIn, onZoomOut, onHome, onPlanet, arcs, onArcsChange, className }: Props) {
  return (
    <TooltipProvider delay={300}>
      <div className={cn("pointer-events-auto flex flex-col items-end gap-2.5", className)}>
        <Capsule>
          <Control label="Zoom in" icon={<Plus />} onClick={onZoomIn} />
          <Divider />
          <Control label="Zoom out" icon={<Minus />} onClick={onZoomOut} />
        </Capsule>
        <Capsule>
          <Control label={onHome ? "Fly home" : "Set a home city in Settings"} icon={<House />} onClick={onHome ?? undefined} disabled={!onHome} />
          <Divider />
          <Control label="Whole planet" icon={<Globe2 />} onClick={onPlanet} />
          {onArcsChange && (
            <>
              <Divider />
              <Control label={arcs ? "Hide arcs from home" : "Show arcs from home"} icon={<Route />} pressed={arcs} onClick={() => onArcsChange(!arcs)} />
            </>
          )}
        </Capsule>
      </div>
    </TooltipProvider>
  );
}

function Capsule({ children }: { children: ReactNode }) {
  return <div className="glass-map specular flex flex-col items-center rounded-full p-0.5">{children}</div>;
}

function Divider() {
  return <span aria-hidden className="h-[0.5px] w-6 bg-separator" />;
}

function Control({ label, icon, onClick, pressed, disabled }: { label: string; icon: ReactNode; onClick?: () => void; pressed?: boolean; disabled?: boolean }) {
  return (
    <Tooltip content={label} side="left">
      <IconButton
        label={label}
        icon={icon}
        size="lg"
        variant="plain"
        pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn("text-fg-2 hover:text-fg [&_svg]:size-[19px]", pressed && "text-accent-text")}
      />
    </Tooltip>
  );
}
