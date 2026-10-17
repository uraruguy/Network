import { metadataOptions, protectedResourceResponse } from "@/lib/mcp/metadata";

/** OAuth Protected Resource Metadata (RFC 9728) — root form, for clients that look here first. */
export function GET() {
  return protectedResourceResponse();
}

export const OPTIONS = metadataOptions;
