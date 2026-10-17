import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAction } from "@/lib/signing";

/**
 * E-mail action endpoint: GET never mutates (link scanners), POST re-verifies the signature and
 * is idempotent. Storage is mocked.
 */

const ID = "3ae4df27-f2e0-42ce-a859-92f1dab46b2a";
const reminder = { id: ID, ownerId: "owner-1", status: "sent" as const, dueAt: new Date(), message: null, personName: "Ana Novak", personDeletedAt: null };

const completeReminder = vi.fn(async () => null);
const snoozeReminder = vi.fn(async () => null);
vi.mock("@/lib/data/reminders", () => ({ completeReminder, snoozeReminder }));

let row: typeof reminder | null = reminder;
vi.mock("@/lib/db", () => {
  const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, limit: async () => (row ? [row] : []) };
  return { db: { select: () => chain }, schema: { reminders: {}, people: {} } };
});
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));

const { GET, POST } = await import("@/app/api/reminders/[id]/[action]/route");
const ctx = (action: string, id = ID) => ({ params: Promise.resolve({ id, action }) });
const post = (action: string, body: unknown, type = "application/json") =>
  new Request(`http://localhost:3100/api/reminders/${ID}/${action}`, {
    method: "POST",
    headers: { "content-type": type },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  row = { ...reminder, dueAt: new Date() };
});

describe("GET /api/reminders/:id/:action (old e-mail links)", () => {
  it("forwards to the confirm page without changing anything", async () => {
    const res = await GET(new Request(`http://localhost:3100/api/reminders/${ID}/done?exp=123&sig=abc&x=1`), ctx("done"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/r/${ID}/done?exp=123&sig=abc`);
    expect(completeReminder).not.toHaveBeenCalled();
    expect(snoozeReminder).not.toHaveBeenCalled();
  });
});

describe("POST /api/reminders/:id/:action", () => {
  it("completes the reminder for a valid signature", async () => {
    const { exp, sig } = signAction([ID, "done"]);
    const res = await POST(post("done", { exp, sig }), ctx("done"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: "done", already: false });
    expect(completeReminder).toHaveBeenCalledWith("owner-1", ID);
  });

  it("snoozes a week, also from a no-JS form post (then back to the page)", async () => {
    const { exp, sig } = signAction([ID, "snooze"]);
    const res = await POST(post("snooze", `exp=${exp}&sig=${sig}`, "application/x-www-form-urlencoded"), ctx("snooze"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain(`/r/${ID}/snooze?exp=${exp}&sig=`);
    expect(snoozeReminder).toHaveBeenCalledWith("owner-1", ID, 7);
  });

  it("rejects signatures for another action, reminder or expiry", async () => {
    const { exp, sig } = signAction([ID, "done"]);
    expect((await POST(post("snooze", { exp, sig }), ctx("snooze"))).status).toBe(403);
    expect((await POST(post("done", { exp: exp + 1, sig }), ctx("done"))).status).toBe(403);
    expect((await POST(post("done", { exp, sig }), ctx("done", "7b4c4fd8-6a35-4c1b-9a43-0d6b1f1b1b1b"))).status).toBe(403);
    expect((await POST(post("delete", { exp, sig }), ctx("delete"))).status).toBe(403);
    expect(completeReminder).not.toHaveBeenCalled();
  });

  it("is idempotent: a settled reminder isn't touched again", async () => {
    row = { ...reminder, status: "done" as never };
    const { exp, sig } = signAction([ID, "done"]);
    expect(await (await POST(post("done", { exp, sig }), ctx("done"))).json()).toEqual({ ok: true, action: "done", already: true });
    row = { ...reminder, dueAt: new Date(Date.now() + 7 * 86_400_000) }; // recurring follow-up moved on
    expect((await (await POST(post("done", { exp, sig }), ctx("done"))).json()).already).toBe(true);
    expect(completeReminder).not.toHaveBeenCalled();
  });

  it("404s for deleted reminders or people", async () => {
    row = null;
    const { exp, sig } = signAction([ID, "done"]);
    expect((await POST(post("done", { exp, sig }), ctx("done"))).status).toBe(404);
    row = { ...reminder, personDeletedAt: new Date() as never };
    expect((await POST(post("done", { exp, sig }), ctx("done"))).status).toBe(404);
  });
});
