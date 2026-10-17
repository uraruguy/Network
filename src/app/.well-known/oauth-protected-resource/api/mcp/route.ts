import { metadataOptions, protectedResourceResponse } from "@/lib/mcp/metadata";

/** OAuth Protected Resource Metadata (RFC 9728) for /api/mcp — the URL our WWW-Authenticate challenge names. */
export function GET() {
  return protectedResourceResponse();
}

export const OPTIONS = metadataOptions;
