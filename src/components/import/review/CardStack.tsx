"use client";
import { Check, X } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useTransform, type MotionValue, type PanInfo, type Variants } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useCoarsePointer } from "@/lib/media";
import { spring, useMotionSafe } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { swipeOutcome, type Motion, type SwipeOutcome } from "./state";

/** Where a card flies when it leaves, and where the next one comes from. */
const moving: Variants = {
  enter: (m: Motion) =>
    m === "back"
      ? { opacity: 0, x: -48, scale: 1, rotate: 0, y: 0 }
      : m === "none"
        ? { opacity: 0, scale: 0.98, x: 0, y: 0, rotate: 0 }
        : { opacity: 0, scale: 0.94, y: 18, x: 0, rotate: 0 },
  center: { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, transition: spring.smooth },
  exit: (m: Motion) => {
    const t = { ...spring.sheet, opacity: { duration: 0.22 } };
    switch (m) {
      case "approve":
        return { x: 520, rotate: 14, opacity: 0, transition: t };
      case "reject":
        return { x: -520, rotate: -14, opacity: 0, transition: t };
      case "passerby":
        return { y: 360, rotate: -4, opacity: 0, transition: t };
      case "merge":
        return { scale: 0.7, y: 40, opacity: 0, transition: t };
      case "later":
        return { y: -420, opacity: 0, transition: t };
      case "back":
        return { x: 64, opacity: 0, transition: { duration: 0.18 } };
      default:
        return { opacity: 0, scale: 0.98, transition: { duration: 0.18 } };
    }
  },
};

/** Draggable cards derive rotation from x, so their variants must not animate it. */
const stripRotate = (v: Variants): Variants =>
  Object.fromEntries(
    Object.entries(v).map(([k, def]) => [
      k,
      typeof def === "function"
        ? (m: Motion) => {
            const { rotate: _r, ...rest } = (def as (m: Motion) => Record<string, unknown>)(m);
            return rest;
          }
        : (({ rotate: _r, ...rest }) => rest)(def as Record<string, unknown>),
    ]),
  ) as Variants;
const movingDrag = stripRotate(moving);

/** Reduced motion: a plain crossfade, no movement. */
const fading: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.14 } },
};

export type CardStackProps = {
  cardKey: string | null;
  motion: Motion;
  /** Name of the card underneath (the peeking "next" card). */
  nextName?: string | null;
  swipeable: boolean;
  onSwipe: (outcome: Exclude<SwipeOutcome, null>) => void;
  children: ReactNode;
  empty?: ReactNode;
};

/** The review stack: one card on top, the next peeking behind, spring transitions and swipe gestures. */
export function CardStack({ cardKey, motion: dir, nextName, swipeable, onSwipe, children, empty }: CardStackProps) {
  const safe = useMotionSafe();
  return (
    <div className="relative">
      {cardKey && nextName && (
        // The next card peeks out below the top one. Cards are translucent, so it never sits behind it.
        <div aria-hidden className="pointer-events-none absolute inset-x-4 -bottom-2 h-2 rounded-b-lg border-x-[0.5px] border-b-[0.5px] border-hairline bg-surface-1 opacity-80 shadow-e1 sm:inset-x-6" />
      )}
      <AnimatePresence mode="popLayout" custom={dir} initial={false}>
        {cardKey ? (
          <SwipeCard key={cardKey} dir={dir} safe={safe} swipeable={swipeable} onSwipe={onSwipe}>
            {children}
          </SwipeCard>
        ) : (
          <motion.div key="empty" variants={safe ? moving : fading} custom={dir} initial="enter" animate="center" exit="exit">
            {empty}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Horizontal swipes are a drag on the card (vertical touches still scroll the page natively).
 * Swiping up means "later" only once the card is scrolled to its end — like pulling to the next
 * card — so it never fights with reading a long card.
 */
function SwipeCard({ dir, safe, swipeable, onSwipe, children }: { dir: Motion; safe: boolean; swipeable: boolean; onSwipe: CardStackProps["onSwipe"]; children: ReactNode }) {
  const coarse = useCoarsePointer();
  const ref = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; t: number; atEnd: boolean } | null>(null);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-10, 0, 10]);
  const approveOpacity = useTransform(x, [24, 110], [0, 1]);
  const rejectOpacity = useTransform(x, [-110, -24], [1, 0]);
  const drag = swipeable && coarse;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const outcome = swipeOutcome({ x: info.offset.x, y: 0 }, { x: info.velocity.x, y: 0 }, ref.current?.offsetWidth ?? 360);
    if (outcome) onSwipe(outcome);
  };

  const atScrollEnd = () => {
    const doc = document.scrollingElement ?? document.documentElement;
    return doc.scrollTop + window.innerHeight >= doc.scrollHeight - 4;
  };

  return (
    <motion.div
      ref={ref}
      custom={dir}
      variants={safe ? (drag ? movingDrag : moving) : fading}
      initial="enter"
      animate="center"
      exit="exit"
      style={drag ? { x, rotate } : undefined}
      drag={drag ? "x" : false}
      dragSnapToOrigin
      dragElastic={0.9}
      dragMomentum={false}
      onDragEnd={drag ? onDragEnd : undefined}
      onTouchStart={
        drag
          ? (e) => {
              const t = e.touches[0];
              touch.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: e.timeStamp, atEnd: atScrollEnd() } : null;
            }
          : undefined
      }
      onTouchEnd={
        drag
          ? (e) => {
              const start = touch.current;
              const t = e.changedTouches[0];
              touch.current = null;
              if (!start || !t || !start.atEnd) return;
              const dt = Math.max(1, e.timeStamp - start.t) / 1000;
              const dy = t.clientY - start.y;
              const out = swipeOutcome({ x: t.clientX - start.x, y: dy }, { x: 0, y: dy / dt }, ref.current?.offsetWidth ?? 360);
              if (out === "later") onSwipe("later");
            }
          : undefined
      }
      className="relative z-[1]"
    >
      {children}
      {drag && (
        <>
          <Stamp opacity={approveOpacity} className="top-6 left-5 -rotate-12 border-success text-success">
            <Check size={18} strokeWidth={3} /> Approve
          </Stamp>
          <Stamp opacity={rejectOpacity} className="top-6 right-5 rotate-12 border-danger text-danger">
            <X size={18} strokeWidth={3} /> Not a person
          </Stamp>
        </>
      )}
    </motion.div>
  );
}

function Stamp({ opacity, className, children }: { opacity: MotionValue<number>; className?: string; children: ReactNode }) {
  return (
    <motion.span
      aria-hidden
      style={{ opacity }}
      className={cn("pointer-events-none absolute z-10 inline-flex items-center gap-1.5 rounded-sm border-2 bg-surface-solid/90 px-3 py-1 text-headline uppercase tracking-wide", className)}
    >
      {children}
    </motion.span>
  );
}
