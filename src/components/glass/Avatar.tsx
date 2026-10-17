"use client";
import { useState } from "react";
import { paletteFor } from "@/lib/constants/palette";
import { cn, initials } from "@/lib/utils";

type Props = { name: string; src?: string | null; size?: number; className?: string };

/**
 * Round avatar: photo when available (lazy, async-decoded, fixed box → no layout shift),
 * otherwise initials on a muted gradient whose hue is derived from the name.
 */
export function Avatar({ name, src, size = 40, className }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = !!src && failed !== src;
  const hue = paletteFor(name).hue;
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-full ring-[0.5px] ring-hairline", className)}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(src)}
          className="block h-full w-full object-cover"
        />
      ) : (
        <span
          role="img"
          aria-label={name}
          className="grid h-full w-full place-items-center font-semibold text-white select-none"
          style={{
            fontSize: Math.round(size * 0.4),
            letterSpacing: "-0.01em",
            background: `linear-gradient(145deg, oklch(var(--avatar-l1) var(--avatar-c) ${hue}), oklch(var(--avatar-l2) var(--avatar-c) ${(hue + 18) % 360}))`,
          }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
