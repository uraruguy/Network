"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** How close (px) to the bottom still counts as "at the bottom". */
const NEAR_BOTTOM = 96;

/**
 * Keeps a scroll container pinned to its newest content — but only while the reader is there.
 *
 * - While pinned, content growth (streaming tokens, tool pills) scrolls instantly: no smooth
 *   animation chasing a moving target.
 * - Scrolling up unpins; coming back near the bottom re-pins.
 * - `scrollToBottom("smooth")` re-pins explicitly (e.g. after sending a message).
 */
export function useStickToBottom<S extends HTMLElement = HTMLDivElement, C extends HTMLElement = HTMLDivElement>() {
  const scrollRef = useRef<S>(null);
  const contentRef = useRef<C>(null);
  const pinned = useRef(true);
  const lastTop = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  const distance = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight;

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    const onScroll = () => {
      const near = distance(el) <= NEAR_BOTTOM;
      // Only an upward scroll by the reader unpins; growth below and our own scrolls never do.
      if (el.scrollTop < lastTop.current - 2 && !near) pinned.current = false;
      if (near) pinned.current = true;
      lastTop.current = el.scrollTop;
      setAtBottom(near);
    };
    const follow = () => {
      if (pinned.current) {
        el.scrollTop = el.scrollHeight;
        lastTop.current = el.scrollTop;
      }
    };

    // Opening a conversation starts at the newest message.
    el.scrollTop = el.scrollHeight;
    lastTop.current = el.scrollTop;

    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(follow);
    observer.observe(content);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  return { scrollRef, contentRef, atBottom, scrollToBottom };
}
