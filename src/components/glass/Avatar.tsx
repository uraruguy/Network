import { cn, hueFromString, initials } from "@/lib/utils";

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const hue = hueFromString(name);
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-full ring-1 ring-white/60 dark:ring-white/10", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div
          className="grid h-full w-full place-items-center font-semibold text-white"
          style={{
            fontSize: size * 0.38,
            background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 40) % 360} 70% 48%))`,
          }}
        >
          {initials(name)}
        </div>
      )}
    </div>
  );
}
