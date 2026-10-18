/**
 * Review session state machine + input mapping (pure — no React, no DOM).
 *
 * The session keeps its own queue (ids in the order they were first seen) and a decision log, so
 * cards don't reshuffle when the server list refreshes, "back" can revisit decided cards, and undo
 * replays the log one step at a time (re-deciding a card logs a second entry; undo restores the
 * first, exactly like the server's per-proposal history).
 */

export type Verdict = "approve" | "reject" | "passerby" | "merge";
export type Motion = Verdict | "later" | "back" | "forward" | "jump" | "none";

export type LogEntry = { id: string; action: Verdict; at: number };

export type ReviewState = {
  queue: string[];
  /** Cursor into `queue`; `queue.length` means the stack is finished. */
  index: number;
  log: LogEntry[];
  /** Last movement, for the card transition. */
  motion: Motion;
  /** Seconds spent per decision (for the time estimate). */
  durations: number[];
  /** When the current card was shown (ms). */
  shownAt: number;
};

export type ReviewEvent =
  | { type: "sync"; ids: string[]; now?: number }
  | { type: "decide"; id: string; action: Verdict; now: number }
  | { type: "undo"; now: number }
  | { type: "revert"; id: string }
  | { type: "later"; now: number }
  | { type: "back"; now: number }
  | { type: "forward"; now: number }
  | { type: "jump"; id: string; now: number };

export const DEFAULT_SECONDS_PER_PERSON = 6;
const MAX_COUNTED_SECONDS = 90;

export function initialReviewState(ids: string[] = [], now = 0): ReviewState {
  return { queue: dedupe(ids), index: 0, log: [], motion: "none", durations: [], shownAt: now };
}

function dedupe(ids: string[]) {
  return [...new Set(ids)];
}

/** Current verdict for a card (the latest log entry), or null. */
export function decisionOf(state: Pick<ReviewState, "log">, id: string): Verdict | null {
  for (let i = state.log.length - 1; i >= 0; i--) if (state.log[i]!.id === id) return state.log[i]!.action;
  return null;
}

export function currentId(state: ReviewState): string | null {
  return state.queue[state.index] ?? null;
}

/** First undecided card after `from`, else the first undecided before it, else the end. */
function nextUndecided(state: ReviewState, from: number): number {
  const decided = new Set(state.log.map((l) => l.id));
  for (let i = from + 1; i < state.queue.length; i++) if (!decided.has(state.queue[i]!)) return i;
  for (let i = 0; i <= Math.min(from, state.queue.length - 1); i++) if (!decided.has(state.queue[i]!)) return i;
  return state.queue.length;
}

export function reviewReducer(state: ReviewState, ev: ReviewEvent): ReviewState {
  switch (ev.type) {
    case "sync": {
      const have = new Set(state.queue);
      const added = ev.ids.filter((id) => !have.has(id));
      if (!added.length) return state;
      const queue = dedupe([...state.queue, ...added]);
      // Finished stack + new arrivals → move onto the first new card.
      const finished = state.index >= state.queue.length;
      return { ...state, queue, index: finished ? state.queue.length : state.index, shownAt: finished ? (ev.now ?? state.shownAt) : state.shownAt, motion: finished ? "forward" : state.motion };
    }
    case "decide": {
      const pos = state.queue.indexOf(ev.id);
      if (pos < 0) return state;
      const spent = Math.min(MAX_COUNTED_SECONDS, Math.max(0, (ev.now - state.shownAt) / 1000));
      const next: ReviewState = {
        ...state,
        log: [...state.log, { id: ev.id, action: ev.action, at: ev.now }],
        durations: [...state.durations, spent].slice(-30),
        motion: ev.action,
        shownAt: ev.now,
      };
      return { ...next, index: nextUndecided(next, pos) };
    }
    case "undo": {
      const last = state.log.at(-1);
      if (!last) return state;
      const log = state.log.slice(0, -1);
      const pos = state.queue.indexOf(last.id);
      return { ...state, log, index: pos < 0 ? state.index : pos, motion: "back", shownAt: ev.now, durations: state.durations.slice(0, -1) };
    }
    case "revert": {
      // The server refused a decision: drop its (latest) log entry and show the card again.
      let i = -1;
      for (let j = state.log.length - 1; j >= 0; j--)
        if (state.log[j]!.id === ev.id) {
          i = j;
          break;
        }
      if (i < 0) return state;
      const pos = state.queue.indexOf(ev.id);
      return { ...state, log: [...state.log.slice(0, i), ...state.log.slice(i + 1)], index: pos < 0 ? state.index : pos, motion: "back" };
    }
    case "later": {
      const id = currentId(state);
      if (!id) return state;
      if (decisionOf(state, id)) return reviewReducer(state, { type: "forward", now: ev.now });
      // Postpone: the card goes to the end of the queue; the cursor stays (now on the next card).
      const queue = [...state.queue.slice(0, state.index), ...state.queue.slice(state.index + 1), id];
      const moved: ReviewState = { ...state, queue, motion: "later", shownAt: ev.now };
      const atCursor = queue[state.index];
      if (atCursor && !decisionOf(moved, atCursor)) return moved;
      return { ...moved, index: nextUndecided(moved, state.index - 1) };
    }
    case "back":
      if (state.index <= 0) return state;
      return { ...state, index: state.index - 1, motion: "back", shownAt: ev.now };
    case "forward":
      if (state.index >= state.queue.length) return state;
      return { ...state, index: state.index + 1, motion: "forward", shownAt: ev.now };
    case "jump": {
      const pos = state.queue.indexOf(ev.id);
      if (pos < 0 || pos === state.index) return state;
      return { ...state, index: pos, motion: "jump", shownAt: ev.now };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Progress                                                           */
/* ------------------------------------------------------------------ */

export type Progress = { decided: number; total: number; remaining: number; secondsLeft: number };

export function reviewProgress(state: ReviewState, total?: number): Progress {
  const decided = new Set(state.log.map((l) => l.id)).size;
  const sessionTotal = Math.max(total ?? 0, state.queue.length, decided);
  const remaining = Math.max(0, sessionTotal - decided);
  const recent = state.durations.slice(-10);
  const per = recent.length >= 2 ? recent.reduce((a, b) => a + b, 0) / recent.length : DEFAULT_SECONDS_PER_PERSON;
  return { decided, total: sessionTotal, remaining, secondsLeft: Math.round(remaining * Math.max(2, per)) };
}

/** "about 4 min left" · "under a minute left" · "" when nothing is left. */
export function formatTimeLeft(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds < 60) return "under a minute left";
  const min = Math.round(seconds / 60);
  return min >= 60 ? `about ${Math.round(min / 6) / 10} h left` : `about ${min} min left`;
}

/* ------------------------------------------------------------------ */
/*  Keyboard                                                           */
/* ------------------------------------------------------------------ */

export type Command =
  | { type: "approve" }
  | { type: "reject" }
  | { type: "passerby" }
  | { type: "merge" }
  | { type: "split" }
  | { type: "edit" }
  | { type: "rename" }
  | { type: "followup" }
  | { type: "later" }
  | { type: "back" }
  | { type: "undo" }
  | { type: "legend" }
  | { type: "category"; index: number };

export type KeyInput = { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; repeat?: boolean };
/** Where the key went: a text field (never steal keys), a button/link (Enter/Space belong to it) or the page. */
export type KeyTarget = "editable" | "interactive" | "page";

const LETTERS: Record<string, Command> = {
  a: { type: "approve" },
  x: { type: "reject" },
  p: { type: "passerby" },
  m: { type: "merge" },
  s: { type: "split" },
  e: { type: "edit" },
  r: { type: "rename" },
  f: { type: "followup" },
  j: { type: "later" },
  k: { type: "back" },
  u: { type: "undo" },
};

const REPEATABLE = new Set<Command["type"]>(["later", "back"]);

/**
 * Maps a keydown to a review command. Ignored while typing, while a dialog is open, with
 * modifiers (except ⌘Z / Ctrl+Z), and on auto-repeat for anything but navigation.
 */
export function keyToCommand(e: KeyInput, target: KeyTarget, modalOpen = false): Command | null {
  if (modalOpen || target === "editable") return null;
  const mod = !!(e.metaKey || e.ctrlKey);
  if (mod) {
    if (!e.altKey && !e.shiftKey && e.key.toLowerCase() === "z") return e.repeat ? null : { type: "undo" };
    return null;
  }
  if (e.altKey) return null;
  let cmd: Command | null = null;
  if (e.key === "?") cmd = { type: "legend" };
  else if (e.key === "Enter") cmd = target === "page" ? { type: "approve" } : null;
  else if (e.key === "ArrowRight") cmd = { type: "later" };
  else if (e.key === "ArrowLeft") cmd = { type: "back" };
  else if (/^[1-7]$/.test(e.key)) cmd = { type: "category", index: Number(e.key) - 1 };
  else if (e.key.length === 1 && !e.shiftKey) cmd = LETTERS[e.key.toLowerCase()] ?? null;
  if (cmd && e.repeat && !REPEATABLE.has(cmd.type)) return null;
  return cmd;
}

/** Classifies a keyboard event target (DOM-free so it can be unit tested with plain objects). */
export function classifyTarget(el: { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null; type?: string } | null): KeyTarget {
  if (!el || !el.tagName) return "page";
  const tag = el.tagName.toUpperCase();
  if (el.isContentEditable) return "editable";
  if (tag === "TEXTAREA" || tag === "SELECT") return "editable";
  if (tag === "INPUT") {
    const t = (el.type ?? "text").toLowerCase();
    return ["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(t) ? "interactive" : "editable";
  }
  const role = el.getAttribute?.("role");
  if (role === "textbox" || role === "combobox" || role === "searchbox") return "editable";
  if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || role === "button" || role === "link" || role === "switch" || role === "checkbox" || role === "radio" || role === "menuitem" || role === "tab") return "interactive";
  return "page";
}

/* ------------------------------------------------------------------ */
/*  Swipe                                                              */
/* ------------------------------------------------------------------ */

export type SwipeOutcome = "approve" | "reject" | "later" | null;

/** Decides a card swipe from its drag offset (px) and release velocity (px/s). */
export function swipeOutcome(offset: { x: number; y: number }, velocity: { x: number; y: number }, width: number): SwipeOutcome {
  const ax = Math.abs(offset.x);
  const ay = Math.abs(offset.y);
  const distance = Math.max(90, width * 0.3);
  if (ay > ax && offset.y < 0) {
    if (-offset.y > 120 || (velocity.y < -700 && -offset.y > 40)) return "later";
    return null;
  }
  if (ax < ay) return null;
  if (offset.x > distance || (velocity.x > 650 && offset.x > 40)) return "approve";
  if (offset.x < -distance || (velocity.x < -650 && offset.x < -40)) return "reject";
  return null;
}
