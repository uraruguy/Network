"use client";
/**
 * Software-keyboard helpers for the note editor on iPhone.
 */
import { useEffect, useState } from "react";

/**
 * Height of the on-screen keyboard (px), from the VisualViewport, also published as the CSS
 * variable `--kb-inset` on <html> so fixed chrome can sit right above the keyboard.
 */
export function useKeyboardInset(active = true): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const layout = root.clientHeight || window.innerHeight;
        const next = Math.max(0, Math.round(layout - vv.height - vv.offsetTop));
        // Ignore tiny differences (URL bar collapse) — a keyboard is always > 120px.
        const value = next > 120 ? next : 0;
        root.style.setProperty("--kb-inset", `${value}px`);
        setInset(value);
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--kb-inset");
    };
  }, [active]);
  return inset;
}

let primed: HTMLInputElement | null = null;
let primeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * iOS only shows the keyboard for focus that happens inside a user gesture. Call this in the tap
 * handler that opens the editor: it focuses an invisible input right away, and the editor takes
 * focus over a moment later, keeping the keyboard up. No-op on devices with a fine pointer.
 */
export function primeKeyboard() {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
  releaseKeyboardPrime();
  const input = document.createElement("input");
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;
  // 16px+ so iOS doesn't zoom; off-screen but focusable.
  input.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;pointer-events:none;";
  document.body.appendChild(input);
  input.focus({ preventScroll: true });
  primed = input;
  primeTimer = setTimeout(releaseKeyboardPrime, 2500);
}

/** Removes the priming input (call after the editor took focus). */
export function releaseKeyboardPrime() {
  if (primeTimer) clearTimeout(primeTimer);
  primeTimer = null;
  primed?.remove();
  primed = null;
}

/** True while a primed keyboard is waiting for the editor to take focus. */
export const isKeyboardPrimed = () => !!primed;
