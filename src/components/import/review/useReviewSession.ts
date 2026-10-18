"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "@/components/ui/Toast";
import type { ProfileProposal } from "@/lib/import/contracts";
import { useDecideProposal, useImportStatus, useReviewQueue, type DecideVars, type Proposal } from "@/lib/queries/import-review";
import { currentId, decisionOf, initialReviewState, reviewProgress, reviewReducer, type Verdict } from "./state";

export type ProposalPatch = {
  displayName?: string;
  aliases?: string[];
  createReminder?: boolean;
  matchPersonId?: string | null;
  profile?: Partial<ProfileProposal>;
};

type ServerDecision = Exclude<DecideVars, { action: "edit" } | { action: "undo" } | { action: "reopen" } | { action: "split" }>;

const UNDO_TOAST = "review-undo";
const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

function applyPatch(p: Proposal, patch: ProposalPatch): Proposal {
  return {
    ...p,
    displayName: patch.displayName ?? p.displayName,
    aliases: patch.aliases ?? p.aliases,
    createReminder: patch.createReminder ?? p.createReminder,
    profile: patch.profile ? { ...p.profile, ...patch.profile } : p.profile,
  };
}

function mergePatch(a: ProposalPatch | undefined, b: ProposalPatch): ProposalPatch {
  return { ...a, ...b, profile: a?.profile || b.profile ? { ...a?.profile, ...b.profile } : undefined };
}

/**
 * One review session: a stable card queue fed by the server's "to review" list, optimistic
 * decisions with undo, debounced inline edits, and per-proposal ordering of server calls (an edit
 * always lands before the decision that follows it, and undo pops exactly that decision).
 */
export function useReviewSession(source: string) {
  const queue = useReviewQueue(source);
  const status = useImportStatus(source);
  const decide = useDecideProposal(source);
  const [state, dispatch] = useReducer(reviewReducer, undefined, () => initialReviewState([], Date.now()));
  const [items, setItems] = useState<Record<string, Proposal>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(0);
  const chains = useRef(new Map<string, Promise<unknown>>());
  const edits = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; patch: ProposalPatch }>());
  const dirty = useRef(new Set<string>());
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Server list → session snapshot (never clobbering cards with unsaved or in-flight edits).
  const fresh = queue.isFetchedAfterMount;
  useEffect(() => {
    const list = queue.data?.items;
    // Ignore the persisted (possibly stale) page until the first fetch of this session lands.
    if (!list || !fresh) return;
    setItems((prev) => {
      const next = { ...prev };
      for (const p of list) if (!next[p.id] || (!dirty.current.has(p.id) && !decisionOf(stateRef.current, p.id))) next[p.id] = p;
      return next;
    });
    dispatch({ type: "sync", ids: list.map((p) => p.id), now: Date.now() });
  }, [queue.data, fresh]);

  /** Runs server calls for one proposal strictly in order. */
  const run = useCallback(<T,>(id: string, fn: () => Promise<T>): Promise<T> => {
    const prev = chains.current.get(id) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    chains.current.set(id, next);
    setPending((n) => n + 1);
    void next.catch(() => undefined).finally(() => setPending((n) => n - 1));
    return next;
  }, []);

  const flushEdit = useCallback(
    (id: string) => {
      const e = edits.current.get(id);
      if (!e) return chains.current.get(id) ?? Promise.resolve();
      clearTimeout(e.timer);
      edits.current.delete(id);
      return run(id, () => decide.mutateAsync({ id, action: "edit", ...e.patch }))
        .catch((err) => toast.error("Couldn’t save the change", { description: errMessage(err) }))
        .finally(() => {
          if (!edits.current.has(id)) dirty.current.delete(id);
        });
    },
    [decide, run],
  );

  /** Optimistic edit; inline toggles are debounced into one `edit` call. */
  const edit = useCallback(
    (id: string, patch: ProposalPatch, opts: { debounce?: boolean } = {}) => {
      setItems((prev) => (prev[id] ? { ...prev, [id]: applyPatch(prev[id]!, patch) } : prev));
      dirty.current.add(id);
      const cur = edits.current.get(id);
      if (cur) clearTimeout(cur.timer);
      const merged = mergePatch(cur?.patch, patch);
      const timer = setTimeout(() => void flushEdit(id), opts.debounce ? 700 : 0);
      edits.current.set(id, { timer, patch: merged });
      if (!opts.debounce) return flushEdit(id);
      return Promise.resolve();
    },
    [flushEdit],
  );

  // Save debounced edits when leaving the page.
  useEffect(() => {
    const map = edits.current;
    return () => {
      for (const id of [...map.keys()]) void flushEdit(id);
    };
  }, [flushEdit]);

  const undoOne = useCallback(
    (id: string) => {
      if (!decisionOf(stateRef.current, id)) return;
      dispatch({ type: "revert", id });
      toast.dismiss(UNDO_TOAST);
      run(id, () => decide.mutateAsync({ id, action: "undo" })).catch((err) => toast.error("Couldn’t undo", { description: errMessage(err) }));
    },
    [decide, run],
  );

  const undoLast = useCallback(() => {
    const last = stateRef.current.log.at(-1);
    if (!last) {
      toast("Nothing to undo");
      return;
    }
    undoOne(last.id);
  }, [undoOne]);

  /** A terminal decision for a card: optimistic, ordered after pending edits, undoable. */
  const verdict = useCallback(
    (id: string, action: Verdict, input: ServerDecision, receipt: string) => {
      if (!items[id]) return;
      dispatch({ type: "decide", id, action, now: Date.now() });
      setLabels((l) => ({ ...l, [id]: receipt }));
      void flushEdit(id);
      toast.undo(receipt, () => undoOne(id), { id: UNDO_TOAST });
      run(id, () => decide.mutateAsync(input as DecideVars)).catch((err) => {
        dispatch({ type: "revert", id });
        toast.error(`Couldn’t save “${items[id]?.displayName ?? "decision"}”`, { description: errMessage(err), id: UNDO_TOAST });
      });
    },
    [items, flushEdit, run, decide, undoOne],
  );

  /** A non-terminal server action on a card (split, edit-sheet save) followed by a refresh of the card. */
  const act = useCallback(
    async (id: string, input: DecideVars, receipt: string) => {
      await flushEdit(id);
      dirty.current.add(id);
      try {
        await run(id, () => decide.mutateAsync(input));
      } catch (err) {
        toast.error("Couldn’t save", { description: errMessage(err) });
        throw err;
      } finally {
        dirty.current.delete(id);
      }
      await queue.refetch();
      toast.undo(
        receipt,
        () =>
          void run(id, () => decide.mutateAsync({ id, action: "undo" }))
            .then(() => queue.refetch())
            .catch((err) => toast.error("Couldn’t undo", { description: errMessage(err) })),
        { id: UNDO_TOAST },
      );
    },
    [flushEdit, run, decide, queue],
  );

  // Keep a few undecided cards ahead: refetch the first page when the queue runs low.
  const undecided = useMemo(() => state.queue.filter((id) => !decisionOf(state, id)).length, [state]);
  const serverOpen = status.data?.proposals.proposed ?? 0;
  const { refetch, isFetching } = queue;
  useEffect(() => {
    if (pending === 0 && !isFetching && undecided < 4 && serverOpen > undecided) void refetch();
  }, [pending, isFetching, undecided, serverOpen, refetch]);

  // Session total, frozen while decisions are in flight so the counter never flickers.
  const decidedCount = useMemo(() => new Set(state.log.map((l) => l.id)).size, [state.log]);
  const [total, setTotal] = useState(0);
  const settled = pending === 0 && !status.isFetching && status.data ? Math.max(state.queue.length, decidedCount + status.data.proposals.proposed) : null;
  const nextTotal = settled ?? Math.max(total, state.queue.length);
  if (nextTotal !== total) setTotal(nextTotal);

  const id = currentId(state);
  return {
    state,
    dispatch,
    items,
    labels,
    current: id ? (items[id] ?? null) : null,
    currentVerdict: id ? decisionOf(state, id) : null,
    progress: reviewProgress(state, total),
    // Until the first server page is in the session queue (avoids a flash of the "done" state).
    loading: !fresh || ((queue.data?.items.length ?? 0) > 0 && state.queue.length === 0),
    error: queue.error,
    pending,
    status,
    verdict,
    edit,
    act,
    undoLast,
    undoOne,
    flushEdit,
    refetch,
  };
}

export type ReviewSession = ReturnType<typeof useReviewSession>;
