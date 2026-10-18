import { describe, expect, it } from "vitest";
import { protectedResourceResponse } from "./metadata";

describe("protectedResourceResponse", () => {
  it("points MCP clients at Supabase Auth for /api/mcp", async () => {
    const body = await protectedResourceResponse().json();
    expect(body).toMatchObject({ resource: "http://localhost:3100/api/mcp", authorization_servers: ["http://127.0.0.1:54321/auth/v1"] });
  });

  it("advertises no scopes: clients would request them and Supabase refuses unknown ones", async () => {
    const body = await protectedResourceResponse().json();
    expect(body).not.toHaveProperty("scopes_supported");
  });
});
