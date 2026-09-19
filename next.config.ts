import type { NextConfig } from "next";
import path from "node:path";

// Turbopack wants project-relative paths; webpack wants absolute ones.
const stubs = {
  "three/webgpu": "./src/lib/stubs/three-webgpu.ts",
  "three/tsl": "./src/lib/stubs/three-tsl.ts",
};
const absStubs = Object.fromEntries(Object.entries(stubs).map(([k, v]) => [k, path.resolve(v)]));

const nextConfig: NextConfig = {
  // three-globe pulls in three's WebGPU build for a heatmap layer we don't use (see src/lib/stubs).
  turbopack: { resolveAlias: stubs },
  // The Agent SDK (Claude subscription path) is only for local use; never trace its CLI binary into functions.
  serverExternalPackages: ["ai-sdk-provider-claude-code", "@anthropic-ai/claude-agent-sdk"],
  outputFileTracingExcludes: { "*": ["./node_modules/.pnpm/@anthropic-ai+claude-agent-sdk*/**", "./node_modules/@anthropic-ai/claude-agent-sdk*/**"] },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, ...absStubs };
    return config;
  },
  headers: async () => [
    { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    { source: "/data/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
  ],
};

export default nextConfig;
