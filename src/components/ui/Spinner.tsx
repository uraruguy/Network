import { cn } from "@/lib/utils";

/** iOS-style activity indicator (8 fading spokes). Inherits `currentColor`. */
export function Spinner({ size = 18, className, label = "Loading" }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="status"
      aria-label={label}
      className={cn("shrink-0 animate-spin [animation-duration:900ms] [animation-timing-function:steps(8)]", className)}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <rect
          key={i}
          x="11"
          y="2"
          width="2"
          height="6"
          rx="1"
          fill="currentColor"
          opacity={0.25 + (i / 8) * 0.75}
          transform={`rotate(${i * 45} 12 12)`}
        />
      ))}
    </svg>
  );
}
