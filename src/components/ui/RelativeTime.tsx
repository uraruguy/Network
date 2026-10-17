"use client";
import { useNow } from "@/lib/clock";
import { formatDate, formatRelative, toDate, type DateInput } from "@/lib/format";

type Props = {
  date: DateInput;
  /** Render something custom from the live `now` (epoch ms). Defaults to "5 minutes ago". */
  format?: (date: Date, now: number) => string;
  className?: string;
  /** Tooltip (`title`) with the absolute date. Default true. */
  title?: boolean;
};

/**
 * Live relative timestamp ("5 minutes ago") driven by the shared minute clock.
 * Renders a semantic <time> with the ISO value; hydration drift between server and client
 * clocks is expected and suppressed.
 */
export function RelativeTime({ date, format, className, title = true }: Props) {
  const now = useNow();
  const d = toDate(date);
  if (!d) return null;
  return (
    <time
      dateTime={d.toISOString()}
      title={title ? formatDate(d, { hour: "2-digit", minute: "2-digit" }) : undefined}
      className={className}
      suppressHydrationWarning
    >
      {format ? format(d, now) : formatRelative(d, now)}
    </time>
  );
}
