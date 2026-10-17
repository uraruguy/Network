"use client";
import { useEffect } from "react";

/** Anything taller than this between the layout and visual viewport is the on-screen keyboard. */
const KEYBOARD_MIN = 120;

/**
 * Tracks the on-screen keyboard on touch devices via VisualViewport and publishes it on <html>:
 *   --kb-inset: <px>   height the keyboard covers (0 when closed)
 *   data-keyboard      present while it is open (the tab bar hides, toasts drop to the edge)
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia("(pointer: coarse)").matches) return;
    const root = document.documentElement;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        const open = inset > KEYBOARD_MIN;
        root.style.setProperty("--kb-inset", `${open ? inset : 0}px`);
        root.toggleAttribute("data-keyboard", open);
      });
    };
    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      root.style.removeProperty("--kb-inset");
      root.removeAttribute("data-keyboard");
    };
  }, []);
}
