"use client";
/**
 * Motion presets — one vocabulary for every animated thing in the app.
 *
 * Springs use motion's duration-based API (`visualDuration` + `bounce`) so they read like the
 * CSS tokens in globals.css (`--spring-snappy`, `--spring-smooth`, …, generated from these same
 * values). Prefer CSS transitions for Base UI popups (interruptible, no JS); reach for these in
 * `motion/react` components (layout animations, lists, gestures).
 */
import { useReducedMotion, type Transition, type Variants } from "motion/react";

export const spring = {
  /** Toggles, chips, small controls. */
  snappy: { type: "spring", visualDuration: 0.25, bounce: 0.1 },
  /** Default UI motion (MotionConfig default). */
  smooth: { type: "spring", visualDuration: 0.35, bounce: 0.12 },
  /** Sheets and large surfaces. */
  sheet: { type: "spring", visualDuration: 0.45, bounce: 0.08 },
  /** Playful confirmation: badges, success ticks. */
  pop: { type: "spring", visualDuration: 0.3, bounce: 0.28 },
} as const satisfies Record<string, Transition>;

export const ease = {
  out: [0.16, 1, 0.3, 1],
  ios: [0.32, 0.72, 0, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const duration = { fast: 0.15, base: 0.22, slow: 0.35 } as const;

/** Fade + slight scale — popovers, cards appearing in place. */
export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: spring.smooth },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.fast, ease: ease.out } },
};

const STAGGER = 0.02;
const STAGGER_CAP = 12; // items after this appear together — long lists never feel slow

/**
 * List rows. Pass the row index as `custom`: `<motion.li variants={listItem} custom={i} …>`.
 * Stagger is capped so the 200th row doesn't wait 4 seconds.
 */
export const listItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...spring.smooth, delay: Math.min(i, STAGGER_CAP) * STAGGER },
  }),
  exit: { opacity: 0, transition: { duration: duration.fast, ease: ease.out } },
};

/** Height collapse for disclosure content. Wrap content in an `overflow-hidden` motion.div. */
export const collapse: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1, transition: { height: spring.smooth, opacity: { duration: duration.base, ease: ease.out } } },
  exit: { height: 0, opacity: 0, transition: { height: { duration: duration.base, ease: ease.ios }, opacity: { duration: duration.fast } } },
};

/** whileTap for pressable motion elements. */
export const tap = { scale: 0.97 } as const;

/**
 * Reduced-motion helper: returns `false` when the user asked for less motion. Use it to turn
 * movement into a plain fade, e.g. `initial={safe ? { y: 12, opacity: 0 } : { opacity: 0 }}`.
 * (MotionConfig `reducedMotion="user"` already disables transform/layout animations globally.)
 */
export function useMotionSafe(): boolean {
  return !useReducedMotion();
}
