import { describe, expect, it } from "vitest";
import { contactLinks, dialable, linkedinUrl, offsetDiffMinutes, offsetLabel } from "./contact";

describe("contactLinks", () => {
  it("returns nothing for an empty card", () => {
    expect(contactLinks({})).toEqual([]);
    expect(contactLinks({ phone: "  ", email: "" })).toEqual([]);
  });

  it("derives every channel in menu order", () => {
    const links = contactLinks({ phone: "+386 (40) 123-456", email: "ana@example.com", linkedin: "https://www.linkedin.com/in/ana/", xHandle: "@ana", instagram: "instagram.com/ana.n", website: "ana.dev" });
    expect(links.map((l) => l.kind)).toEqual(["sms", "call", "whatsapp", "email", "linkedin", "x", "instagram", "website"]);
    expect(links.find((l) => l.kind === "sms")!.href).toBe("sms:+38640123456");
    expect(links.find((l) => l.kind === "whatsapp")!.href).toBe("https://wa.me/38640123456");
    expect(links.find((l) => l.kind === "email")!.href).toBe("mailto:ana@example.com");
    expect(links.find((l) => l.kind === "linkedin")).toMatchObject({ href: "https://www.linkedin.com/in/ana/", value: "ana" });
    expect(links.find((l) => l.kind === "x")).toMatchObject({ href: "https://x.com/ana", value: "@ana" });
    expect(links.find((l) => l.kind === "instagram")!.value).toBe("@ana.n");
    expect(links.find((l) => l.kind === "website")).toMatchObject({ href: "https://ana.dev", value: "ana.dev", external: true });
  });

  it("handles bare handles and urls", () => {
    expect(linkedinUrl("ana-novak")).toBe("https://www.linkedin.com/in/ana-novak");
    expect(linkedinUrl("linkedin.com/in/ana")).toBe("https://linkedin.com/in/ana");
    expect(dialable("040 123 456")).toBe("040123456");
  });
});

describe("time zone offsets", () => {
  it("labels the difference", () => {
    expect(offsetLabel(0)).toBeNull();
    expect(offsetLabel(null)).toBeNull();
    expect(offsetLabel(120)).toBe("2h ahead");
    expect(offsetLabel(-480)).toBe("8h behind");
    expect(offsetLabel(330)).toBe("5h 30m ahead");
  });

  it("computes their offset minus ours (DST-aware)", () => {
    const now = Date.UTC(2026, 6, 1, 12, 0); // July: Ljubljana is UTC+2, Kolkata UTC+5:30
    const ours = -new Date(now).getTimezoneOffset();
    expect(offsetDiffMinutes("Europe/Ljubljana", now)).toBe(120 - ours);
    expect(offsetDiffMinutes("Asia/Kolkata", now)).toBe(330 - ours);
    expect(offsetDiffMinutes("Not/AZone", now)).toBeNull();
    expect(offsetDiffMinutes(null, now)).toBeNull();
  });
});
