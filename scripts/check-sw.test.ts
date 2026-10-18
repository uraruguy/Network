import { describe, expect, it } from "vitest";
import { duplicatePrecacheUrls, non2xxPrecachedPages, precacheEntries, prerenderMetaPath } from "./check-sw";

describe("precacheEntries", () => {
  it("reads manifest entries, not the fallbacks config", () => {
    const sw = `var w=[{revision:null,url:"/_next/a.js"},{revision:"7198",url:"/today"}];fallbacks:{entries:[{url:"/~offline",matcher(){}}]}`;
    expect(precacheEntries(sw)).toEqual([
      { revision: "null", url: "/_next/a.js" },
      { revision: '"7198"', url: "/today" },
    ]);
  });
});

describe("duplicatePrecacheUrls", () => {
  it("flags a URL precached twice with different revisions", () => {
    const sw = `var w=[{revision:null,url:"/_next/a.js"},{revision:"f1f4",url:"/~offline"},{revision:"55233c",url:"/~offline"}];`;
    expect(duplicatePrecacheUrls(sw)).toEqual(["/~offline"]);
  });

  it("accepts a clean manifest (and exact repeats)", () => {
    const sw = `var w=[{revision:null,url:"/_next/a.js"},{revision:"7198",url:"/~offline"},{revision:null,url:"/_next/a.js"}];`;
    expect(duplicatePrecacheUrls(sw)).toEqual([]);
  });
});

describe("prerenderMetaPath", () => {
  it("maps a page URL to its .meta file", () => {
    expect(prerenderMetaPath("/dev/ui")).toBe(".next/server/app/dev/ui.meta");
    expect(prerenderMetaPath("/~offline")).toBe(".next/server/app/~offline.meta");
    expect(prerenderMetaPath("/")).toBe(".next/server/app/index.meta");
  });
});

describe("non2xxPrecachedPages", () => {
  const statuses: Record<string, number> = { "/today": 200, "/dev/ui": 404, "/": 307, "/~offline": 200 };
  const statusOf = (url: string) => statuses[url];

  it("flags 4xx pages (install fails) and redirects (stale copy of the target)", () => {
    const sw = `var w=[{revision:null,url:"/_next/a.js"},{revision:"1",url:"/today"},{revision:"2",url:"/dev/ui"},{revision:"3",url:"/"},{revision:"4",url:"/~offline"}];`;
    expect(non2xxPrecachedPages(sw, statusOf)).toEqual([
      { url: "/dev/ui", status: 404 },
      { url: "/", status: 307 },
    ]);
  });

  it("ignores assets and other non-prerendered URLs", () => {
    const sw = `var w=[{revision:null,url:"/_next/static/chunks/x.js"},{revision:"1",url:"/icons/icon-192.png"},{revision:"2",url:"/today"}];`;
    expect(non2xxPrecachedPages(sw, statusOf)).toEqual([]);
  });
});
