import { describe, expect, it } from "vitest";
import { duplicatePrecacheUrls } from "./check-sw";

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
