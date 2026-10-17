import { describe, expect, it } from "vitest";
import { fromIsoDay, isoDay } from "./dates";
import { openThreadsMarkdown, planReminders } from "./reminders-policy";

const now = new Date("2026-10-17T10:00:00.000Z");
const d = (s: string) => fromIsoDay(s)!;

describe("planReminders", () => {
  it("explicit future date → dated reminder; extras become open threads", () => {
    const plan = planReminders(
      [{ key: "ana", createReminder: true, followUps: [
        { what: "Send deck", when: null, explicitDate: "2026-12-01", noteDate: d("2026-10-01") },
        { what: "Intro to Marko", when: "čez 3 tedne", noteDate: d("2026-10-10") },
      ] }],
      now,
    ).get("ana")!;
    expect(plan.reminder?.kind).toBe("dated");
    expect(isoDay(plan.reminder!.dueAt)).toBe("2026-10-31");
    expect(plan.reminder!.message).toBe("Intro to Marko");
    expect(plan.openThreads.map((t) => t.what)).toEqual(["Send deck"]);
  });

  it("relative date that is already past → open thread", () => {
    const plan = planReminders([{ key: "b", createReminder: true, followUps: [{ what: "Call", when: "next week", noteDate: d("2025-03-01") }] }], now).get("b")!;
    expect(plan.reminder).toBeNull();
    expect(plan.openThreads[0]).toMatchObject({ what: "Call", why: "past" });
  });

  it("undated + recent note → one combined reminder; undated + old → open thread", () => {
    const plans = planReminders(
      [
        { key: "c", createReminder: true, followUps: [{ what: "Ping", when: null, noteDate: d("2026-09-20") }, { what: "Beer", when: "ko bo čas", noteDate: d("2026-10-01") }] },
        { key: "old", createReminder: true, followUps: [{ what: "Old thing", when: null, noteDate: d("2025-01-01") }] },
      ],
      now,
    );
    const c = plans.get("c")!;
    expect(c.reminder?.kind).toBe("combined");
    expect(c.reminder!.message).toBe("Ping · Beer");
    expect(isoDay(c.reminder!.dueAt)).toBe("2026-10-18");
    expect(plans.get("old")!.reminder).toBeNull();
    expect(plans.get("old")!.openThreads[0]!.why).toBe("undated-old");
  });

  it("spreads combined reminders ≤3/day over 14 days, overflow → open threads", () => {
    const people = Array.from({ length: 45 }, (_, i) => ({ key: `p${i}`, createReminder: true, followUps: [{ what: `t${i}`, when: null, noteDate: d("2026-10-10") }] }));
    const plans = planReminders(people, now);
    const perDay = new Map<string, number>();
    let reminders = 0;
    for (const p of plans.values()) {
      if (!p.reminder) continue;
      reminders++;
      const k = isoDay(p.reminder.dueAt);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    expect(reminders).toBe(42);
    expect(Math.max(...perDay.values())).toBe(3);
    expect([...perDay.keys()].sort()[0]).toBe("2026-10-18");
    expect([...perDay.keys()].sort().at(-1)).toBe("2026-10-31");
    expect([...plans.values()].filter((p) => p.openThreads.some((t) => t.why === "overflow")).length).toBe(3);
  });

  it("createReminder=false → everything is an open thread", () => {
    const plan = planReminders([{ key: "x", createReminder: false, followUps: [{ what: "A", when: null, explicitDate: "2027-01-01", noteDate: d("2026-10-01") }] }], now).get("x")!;
    expect(plan.reminder).toBeNull();
    expect(plan.openThreads).toHaveLength(1);
  });

  it("renders a checklist", () => {
    const md = openThreadsMarkdown([{ what: "Send deck", when: "kmalu", noteDate: d("2026-01-02"), sourceItemId: null, sourceTitle: "Kava", why: "past" }]);
    expect(md).toContain("## Open threads");
    expect(md).toContain("- [ ] Send deck _(“Kava”, 2026-01-02, when: kmalu)_");
  });
});
