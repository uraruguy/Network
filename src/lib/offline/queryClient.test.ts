import { QueryClient, type Mutation } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { describe, expect, it } from "vitest";
import { registerChatMutations } from "@/lib/queries/chat";
import { isReplayableWrite, resumeInFlight, shouldPersistMutation, shouldPersistQuery } from "./queryClient";

function persisted(qc: QueryClient, key: readonly unknown[]) {
  return shouldPersistQuery(qc.getQueryCache().find({ queryKey: key, exact: true })!);
}

describe("shouldPersistQuery", () => {
  it("persists ordinary successful queries", () => {
    const qc = new QueryClient();
    qc.setQueryData(["people", "index"], []);
    qc.setQueryData(["note", "n1"], { id: "n1" });
    expect(persisted(qc, ["people", "index"])).toBe(true);
    expect(persisted(qc, ["note", "n1"])).toBe(true);
  });

  it("never persists chat transcripts, security data, city lookups or searches — meta or not", () => {
    const qc = new QueryClient();
    for (const key of [["chat", "thread", "t1"], ["chat", "threads"], ["security", "overview"], ["connected-apps"], ["cities", "lju"], ["people", "search", {}], ["notes", "search", "q", null]]) {
      qc.setQueryData(key, { x: 1 });
      expect(persisted(qc, key)).toBe(false);
    }
  });

  it("honours meta.persist = false, also for entries created by setQueryData under chat defaults", () => {
    const qc = new QueryClient();
    registerChatMutations(qc);
    qc.setQueryData(["chat", "thread", "t2"], { messages: [] });
    expect(qc.getQueryCache().find({ queryKey: ["chat", "thread", "t2"] })!.meta).toEqual({ persist: false });
    qc.setQueryDefaults(["volatile"], { meta: { persist: false } });
    qc.setQueryData(["volatile", 1], 1);
    expect(persisted(qc, ["volatile", 1])).toBe(false);
  });
});

describe("persisting writes", () => {
  const m = (mutationKey: unknown[], state: Partial<Mutation["state"]>) => ({ options: { mutationKey }, state: { status: "pending", isPaused: false, variables: undefined, ...state } }) as unknown as Mutation;

  it("keeps paused writes, and in-flight ones that are safe to send again", () => {
    expect(shouldPersistMutation(m(["inbox", "x"], { isPaused: true }))).toBe(true);
    expect(shouldPersistMutation(m(["notes", "upsert"], { variables: { id: "n1" } }))).toBe(true);
    expect(shouldPersistMutation(m(["people", "create"], { variables: { id: "p1" } }))).toBe(true);
    expect(shouldPersistMutation(m(["notes", "upsert"], { status: "success" }))).toBe(false);
    expect(shouldPersistMutation(m(["inbox", "x"], {}))).toBe(false);
  });

  it("never replays completing a follow-up (a repeat would skip a recurrence)", () => {
    expect(isReplayableWrite(["reminders", "action"], { id: "r", action: "done" })).toBe(false);
    expect(isReplayableWrite(["reminders", "action"], { id: "r", action: "reschedule" })).toBe(true);
    expect(isReplayableWrite(["reminders", "create"], { id: "r" })).toBe(true);
    expect(isReplayableWrite(undefined, {})).toBe(false);
  });

  it("restores in-flight writes as paused so they resume with the rest", () => {
    const client = {
      timestamp: 1,
      buster: "v2",
      clientState: {
        queries: [],
        mutations: [
          { mutationKey: ["notes", "upsert"], state: { status: "pending", isPaused: false } },
          { mutationKey: ["people", "update"], state: { status: "pending", isPaused: true } },
        ],
      },
    } as unknown as PersistedClient;
    expect(resumeInFlight(client).clientState.mutations.map((x) => x.state.isPaused)).toEqual([true, true]);
  });
});
