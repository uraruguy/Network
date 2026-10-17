import { describe, expect, it } from "vitest";
import { dateFromTitle, fromIsoDay, isoDay, noteDate, resolveWhen } from "./dates";

const d = (s: string) => fromIsoDay(s)!;

describe("dateFromTitle", () => {
  it("parses dd.mm.yyyy variants", () => {
    expect(isoDay(dateFromTitle("Sestanek 12.3.2025")!)).toBe("2025-03-12");
    expect(isoDay(dateFromTitle("Call 01. 02. 2026 z Ingotom")!)).toBe("2026-02-01");
    expect(isoDay(dateFromTitle("Dialog V Zivo 20.12.24")!)).toBe("2024-12-20");
  });
  it("rejects invalid dates", () => {
    expect(dateFromTitle("31.2.2025")).toBeNull();
    expect(dateFromTitle("Verzija 1.2.3")).toBeNull();
    expect(dateFromTitle(null)).toBeNull();
  });
});

describe("noteDate", () => {
  const created = new Date("2025-09-19T07:35:47.000Z");
  it("title wins", () => {
    expect(noteDate({ title: "Call 1.9.2025", occurredAt: "2025-09-10", created })).toMatchObject({ source: "title" });
  });
  it("uses occurredAt within [created-2y, created+30d]", () => {
    expect(isoDay(noteDate({ title: "x", occurredAt: "2024-01-05", created }).date)).toBe("2024-01-05");
    expect(noteDate({ title: "x", occurredAt: "2025-10-15", created }).source).toBe("extracted");
    expect(noteDate({ title: "x", occurredAt: "2025-11-15", created }).source).toBe("created");
    expect(noteDate({ title: "x", occurredAt: "2023-01-01", created }).source).toBe("created");
  });
  it("falls back to created", () => {
    expect(noteDate({ title: null, occurredAt: null, created }).date).toBe(created);
  });
});

describe("resolveWhen", () => {
  const base = d("2026-10-01"); // Thursday
  it("ISO and dd.mm.", () => {
    expect(isoDay(resolveWhen("2026-12-01", base)!)).toBe("2026-12-01");
    expect(isoDay(resolveWhen("do 1.12.", base)!)).toBe("2026-12-01");
    expect(isoDay(resolveWhen("15.3.", base)!)).toBe("2027-03-15");
  });
  it("relative phrases (Slovenian + English)", () => {
    expect(isoDay(resolveWhen("čez 2 tedna", base)!)).toBe("2026-10-15");
    expect(isoDay(resolveWhen("in 3 days", base)!)).toBe("2026-10-04");
    expect(isoDay(resolveWhen("next week", base)!)).toBe("2026-10-08");
    expect(isoDay(resolveWhen("naslednji mesec", base)!)).toBe("2026-11-01");
    expect(isoDay(resolveWhen("jutri", base)!)).toBe("2026-10-02");
    expect(isoDay(resolveWhen("v ponedeljek", base)!)).toBe("2026-10-05");
    expect(isoDay(resolveWhen("januarja", base)!)).toBe("2027-01-01");
    expect(isoDay(resolveWhen("čez en mesec", base)!)).toBe("2026-11-01");
  });
  it("null when nothing parses", () => {
    expect(resolveWhen("ko bo čas", base)).toBeNull();
    expect(resolveWhen(null, base)).toBeNull();
  });
});
