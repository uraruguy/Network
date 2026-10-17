import type { NextConfig } from "next";
import path from "node:path";
import { baseSecurityHeaders, staticCspHeaders } from "./src/lib/security/headers";

// Turbopack wants project-relative paths; webpack wants absolute ones.
const stubs = {
  "three/webgpu": "./src/lib/stubs/three-webgpu.ts",
  "three/tsl": "./src/lib/stubs/three-tsl.ts",
};
const absStubs = Object.fromEntries(Object.entries(stubs).map(([k, v]) => [k, path.resolve(v)]));

const production = process.env.NODE_ENV === "production";

/**
 * Routes that must NOT get the static CSP:
 * - the sign-in surface, which gets a per-request nonce policy from src/proxy.ts;
 * - the digest preview, an HTML e-mail rendered with its own sandboxing policy.
 * Keep in sync with NONCE_PAGE_PREFIXES in src/lib/security/csp.ts.
 */
const STATIC_CSP_SOURCE = "/((?!login(?:/|$)|oauth/consent(?:/|$)|api/digest/preview$).*)";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // three-globe pulls in three's WebGPU build for a heatmap layer we don't use (see src/lib/stubs).
  turbopack: { resolveAlias: stubs },
  // The Agent SDK (Claude subscription path) is only for local use; never trace its CLI binary into functions.
  serverExternalPackages: ["ai-sdk-provider-claude-code", "@anthropic-ai/claude-agent-sdk"],
  outputFileTracingExcludes: { "*": ["./node_modules/.pnpm/@anthropic-ai+claude-agent-sdk*/**", "./node_modules/@anthropic-ai/claude-agent-sdk*/**"] },
  experimental: {
    // Subresource Integrity: build-time hashes on our script tags (works with static pages, unlike nonces).
    sri: { algorithm: "sha256" },
  },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, ...absStubs };
    return config;
  },
  // Later entries override earlier ones for the same header key.
  headers: async () => [
    { source: "/(.*)", headers: baseSecurityHeaders({ production }) },
    {
      source: STATIC_CSP_SOURCE,
      headers: staticCspHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, dev: !production }),
    },
    // One-click e-mail links carry a signature in the query string: never leak it via Referer.
    { source: "/r/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    { source: "/api/digest/preview", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    { source: "/data/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
  ],
};

export default nextConfig;
